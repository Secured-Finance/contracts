// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// dependencies
import {EnumerableSet} from "../../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {Constants} from "../Constants.sol";
import {FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {LendingMarketOperationLogic} from "./LendingMarketOperationLogic.sol";
import {FundManagementLogic} from "./FundManagementLogic.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketUserLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeCast for int256;
    using RoundingUint256 for uint256;

    error InvalidAmount();
    error FutureValueIsZero();
    error TooManyActiveOrders();
    error NotEnoughCollateral();
    error NotEnoughDeposit(bytes32 ccy);

    struct EstimateCollateralCoverageParams {
        bytes32 ccy;
        uint256 maturity;
        address user;
        ProtocolTypes.Side side;
        uint256 unitPrice;
        uint256 additionalDepositAmount;
        bool ignoreBorrowedAmount;
        uint256 filledAmount;
        uint256 filledAmountInFV;
        uint256 orderFeeInFV;
        uint256 placedAmount;
    }

    function getOrderEstimation(
        ILendingMarketController.GetOrderEstimationParams memory input
    )
        external
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV,
            uint256 placedAmount,
            uint256 coverage,
            bool isInsufficientDepositAmount
        )
    {
        (
            lastUnitPrice,
            filledAmount,
            filledAmountInFV,
            orderFeeInFV,
            placedAmount
        ) = _calculateFilledAmount(
            input.ccy,
            input.maturity,
            input.side,
            input.amount,
            input.unitPrice
        );

        (coverage, isInsufficientDepositAmount) = _estimateCollateralCoverage(
            EstimateCollateralCoverageParams(
                input.ccy,
                input.maturity,
                input.user,
                input.side,
                input.unitPrice,
                input.additionalDepositAmount,
                input.ignoreBorrowedAmount,
                filledAmount,
                filledAmountInFV,
                orderFeeInFV,
                placedAmount
            )
        );
    }

    function executeOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external {
        if (_amount == 0) revert InvalidAmount();

        uint256 activeOrderCount = FundManagementLogic.cleanUpFunds(_ccy, _user);
        FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);

        (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV
        ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy]).executeOrder(
                Storage.slot().maturityOrderBookIds[_ccy][_maturity],
                _side,
                _user,
                _amount,
                _unitPrice
            );

        uint256 filledAmount = filledOrder.amount;

        // The case that an order is placed in the order book
        if ((filledAmount + filledOrder.ignoredAmount) != _amount) {
            unchecked {
                activeOrderCount += 1;
            }
        }

        if (activeOrderCount > Constants.MAXIMUM_ORDER_COUNT) revert TooManyActiveOrders();

        updateFundsForTaker(
            _ccy,
            _maturity,
            _user,
            _side,
            filledAmount,
            filledOrder.futureValue,
            feeInFV
        );

        updateFundsForMaker(
            _ccy,
            _maturity,
            _side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        // Updates the pending order amount for marker's orders.
        // Since the partially filled order is updated with `updateFundsForMaker()`,
        // its amount is subtracted from `pendingOrderAmounts`.
        Storage.slot().pendingOrderAmounts[_ccy][_maturity] +=
            filledAmount -
            partiallyFilledOrder.amount;

        Storage.slot().usedCurrencies[_user].add(_ccy);

        _isCovered(_user, _ccy);
    }

    function executePreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external {
        if (_amount == 0) revert InvalidAmount();

        uint256 activeOrderCount = FundManagementLogic.cleanUpFunds(_ccy, _user);

        if (activeOrderCount + 1 > Constants.MAXIMUM_ORDER_COUNT) revert TooManyActiveOrders();

        FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);

        ILendingMarket(Storage.slot().lendingMarkets[_ccy]).executePreOrder(
            Storage.slot().maturityOrderBookIds[_ccy][_maturity],
            _side,
            _user,
            _amount,
            _unitPrice
        );

        Storage.slot().usedCurrencies[_user].add(_ccy);

        _isCovered(_user, _ccy);
    }

    function unwindPosition(bytes32 _ccy, uint256 _maturity, address _user) external {
        FundManagementLogic.cleanUpFunds(_ccy, _user);

        int256 futureValue = FundManagementLogic
            .getActualFunds(_ccy, _maturity, _user, 0)
            .futureValue;

        (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV,
            ProtocolTypes.Side side
        ) = _unwindPosition(_ccy, _maturity, _user, futureValue);

        updateFundsForTaker(
            _ccy,
            _maturity,
            _user,
            side,
            filledOrder.amount,
            filledOrder.futureValue,
            feeInFV
        );

        updateFundsForMaker(
            _ccy,
            _maturity,
            side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        // Updates the pending order amount for marker's orders.
        // Since the partially filled order is updated with `updateFundsForMaker()`,
        // its amount is subtracted from `pendingOrderAmounts`.
        Storage.slot().pendingOrderAmounts[_ccy][_maturity] +=
            filledOrder.amount -
            partiallyFilledOrder.amount;

        // When the market is the nearest market and the user has only GV, a user still has future value after unwinding.
        // For that case, the `registerCurrencyAndMaturity` function needs to be called again.
        (int256 currentFutureValue, ) = IFutureValueVault(Storage.slot().futureValueVaults[_ccy])
            .getBalance(Storage.slot().maturityOrderBookIds[_ccy][_maturity], _user);

        if (currentFutureValue != 0) {
            FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);
        }

        _isCovered(_user, _ccy);
    }

    function updateFundsForTaker(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _filledAmount,
        uint256 _filledAmountInFV,
        uint256 _feeInFV
    ) public {
        if (_filledAmountInFV != 0) {
            FundManagementLogic.updateFunds(
                _ccy,
                _maturity,
                _user,
                _side,
                _filledAmount,
                _filledAmountInFV,
                _feeInFV
            );

            LendingMarketOperationLogic.updateOrderLogs(
                _ccy,
                _maturity,
                _filledAmount,
                _filledAmountInFV
            );

            emit FundManagementLogic.OrderFilled(
                _user,
                _ccy,
                _side,
                _maturity,
                _filledAmount,
                _filledAmountInFV,
                _feeInFV
            );
        }
    }

    function updateFundsForMaker(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        PartiallyFilledOrder memory partiallyFilledOrder
    ) public {
        if (partiallyFilledOrder.futureValue != 0) {
            FundManagementLogic.updateFunds(
                _ccy,
                _maturity,
                partiallyFilledOrder.maker,
                _side,
                partiallyFilledOrder.amount,
                partiallyFilledOrder.futureValue,
                0
            );

            emit FundManagementLogic.OrderPartiallyFilled(
                partiallyFilledOrder.orderId,
                partiallyFilledOrder.maker,
                _ccy,
                _side,
                _maturity,
                partiallyFilledOrder.amount,
                partiallyFilledOrder.futureValue
            );
        }
    }

    function _calculateFilledAmount(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        internal
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV,
            uint256 placedAmount
        )
    {
        (
            lastUnitPrice,
            filledAmount,
            filledAmountInFV,
            orderFeeInFV,
            placedAmount
        ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy]).calculateFilledAmount(
            Storage.slot().maturityOrderBookIds[_ccy][_maturity],
            _side,
            _amount,
            _unitPrice
        );
    }

    function _estimateCollateralCoverage(
        EstimateCollateralCoverageParams memory _params
    ) internal view returns (uint256 coverage, bool isInsufficientDepositAmount) {
        uint256 filledAmountWithFeeInFV = _params.filledAmountInFV;

        if (_params.side == ProtocolTypes.Side.LEND) {
            filledAmountWithFeeInFV -= _params.orderFeeInFV;
        } else {
            filledAmountWithFeeInFV += _params.orderFeeInFV;
        }

        uint256 filledAmountWithFeeInPV = _estimatePVFromFV(
            _params.ccy,
            _params.maturity,
            filledAmountWithFeeInFV,
            _params.unitPrice
        );

        ILendingMarketController.AdditionalFunds memory funds;
        funds.ccy = _params.ccy;
        // Store the _additionalDepositAmount in the borrowedAmount,
        // because the borrowedAmount is used as collateral.
        funds.borrowedAmount = _params.additionalDepositAmount;

        if (_params.placedAmount != 0) {
            if (_params.side == ProtocolTypes.Side.BORROW) {
                uint256 minUnitPrice = FundManagementLogic.getCurrentMinDebtUnitPrice(
                    _params.maturity,
                    Storage.slot().minDebtUnitPrices[_params.ccy]
                );

                if (_params.unitPrice >= minUnitPrice) {
                    funds.workingBorrowOrdersAmount = _params.placedAmount;
                } else {
                    // NOTE: The formula is:
                    // futureValue = placedAmount / unitPrice
                    // workingBorrowOrdersAmount = futureValue * minUnitPrice
                    funds.workingBorrowOrdersAmount = (_params.placedAmount * minUnitPrice).div(
                        _params.unitPrice
                    );
                }
            } else {
                funds.workingLendOrdersAmount = _params.placedAmount;
            }
        }

        if (filledAmountWithFeeInPV > 0) {
            if (_params.side == ProtocolTypes.Side.BORROW) {
                if (!_params.ignoreBorrowedAmount) {
                    funds.borrowedAmount += _params.filledAmount;
                }
                funds.debtAmount += filledAmountWithFeeInPV;
            } else {
                funds.lentAmount += _params.filledAmount;
                funds.claimableAmount += filledAmountWithFeeInPV;
            }
        }

        (coverage, isInsufficientDepositAmount) = AddressResolverLib.tokenVault().calculateCoverage(
            _params.user,
            funds
        );
    }

    function _estimatePVFromFV(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _amount,
        uint256 _unitPrice
    ) internal view returns (uint256) {
        uint256 marketUnitPrice = ILendingMarket(Storage.slot().lendingMarkets[_ccy])
            .getMarketUnitPrice(Storage.slot().maturityOrderBookIds[_ccy][_maturity]);

        if (marketUnitPrice == 0) {
            marketUnitPrice = _unitPrice;
        }

        return (_amount * marketUnitPrice).div(Constants.PRICE_DIGIT);
    }

    function _unwindPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        int256 _futureValue
    )
        internal
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV,
            ProtocolTypes.Side side
        )
    {
        if (_futureValue == 0) revert FutureValueIsZero();

        if (_futureValue > 0) {
            side = ProtocolTypes.Side.BORROW;

            (filledOrder, partiallyFilledOrder, feeInFV) = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy]
            ).unwindPosition(
                    Storage.slot().maturityOrderBookIds[_ccy][_maturity],
                    side,
                    _user,
                    _futureValue.toUint256()
                );
        } else if (_futureValue < 0) {
            side = ProtocolTypes.Side.LEND;

            (filledOrder, partiallyFilledOrder, feeInFV) = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy]
            ).unwindPosition(
                    Storage.slot().maturityOrderBookIds[_ccy][_maturity],
                    side,
                    _user,
                    (-_futureValue).toUint256()
                );
        }
    }

    function _isCovered(address _user, bytes32 _ccy) internal view {
        (bool isEnoughCollateral, bool isEnoughDepositInOrderCcy) = AddressResolverLib
            .tokenVault()
            .isCovered(_user, _ccy);

        if (!isEnoughDepositInOrderCcy) revert NotEnoughDeposit(_ccy);
        if (!isEnoughCollateral) revert NotEnoughCollateral();
    }
}
