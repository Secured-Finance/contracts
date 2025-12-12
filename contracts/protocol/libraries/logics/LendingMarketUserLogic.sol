// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// dependencies
import {EnumerableSet} from "../../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
import {IZCToken} from "../../interfaces/IZCToken.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {Constants} from "../Constants.sol";
import {FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {LendingMarketOperationLogic} from "./LendingMarketOperationLogic.sol";
import {FundManagementLogic} from "./FundManagementLogic.sol";
import {TransferHelper} from "../TransferHelper.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketUserLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeCast for int256;
    using SafeCast for uint256;
    using RoundingUint256 for uint256;

    error InvalidAmount();
    error AmountIsZero();
    error FutureValueIsZero();
    error TooManyActiveOrders();
    error NotEnoughCollateral();
    error NotEnoughDeposit(bytes32 ccy);
    error InvalidAction();
    error InvalidBatchData();

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

    struct DepositActionArgs {
        address from;
        bytes32 ccy;
        uint256 amount;
    }

    struct ExecuteOrderActionArgs {
        bytes32 ccy;
        uint256 maturity;
        ProtocolTypes.Side side;
        uint256 amount;
        uint256 unitPrice;
    }

    struct ExecutePreOrderActionArgs {
        bytes32 ccy;
        uint256 maturity;
        ProtocolTypes.Side side;
        uint256 amount;
        uint256 unitPrice;
    }

    struct UnwindPositionActionArgs {
        bytes32 ccy;
        uint256 maturity;
        uint256 maxAmountInFV;
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

    function getOrderEstimationFromFV(
        ILendingMarketController.GetOrderEstimationFromFVParams memory input
    )
        external
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV,
            uint256 coverage,
            bool isInsufficientDepositAmount
        )
    {
        (
            lastUnitPrice,
            filledAmount,
            filledAmountInFV,
            orderFeeInFV
        ) = _calculateFilledAmountFromFV(input.ccy, input.maturity, input.side, input.amountInFV);

        (coverage, isInsufficientDepositAmount) = _estimateCollateralCoverage(
            EstimateCollateralCoverageParams(
                input.ccy,
                input.maturity,
                input.user,
                input.side,
                0, // unitPrice
                input.additionalDepositAmount,
                input.ignoreBorrowedAmount,
                filledAmount,
                filledAmountInFV,
                orderFeeInFV,
                0 // placedAmount
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
        _executeOrder(_ccy, _maturity, _user, _side, _amount, _unitPrice);
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
        _executePreOrder(_ccy, _maturity, _user, _side, _amount, _unitPrice);
        _isCovered(_user, _ccy);
    }

    function unwindPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _maxAmountInFV
    ) external returns (uint256 filledAmount, uint256 filledAmountInFV, uint256 feeInFV) {
        (filledAmount, filledAmountInFV, feeInFV) = _unwindPositionWithoutCheck(
            _ccy,
            _maturity,
            _user,
            _maxAmountInFV
        );
        _isCovered(_user, _ccy);
    }

    /**
     * @notice Execute multiple actions in a single transaction
     * @dev Gas-optimized batch execution using BatchAction enum.
     *      Inspired by Compound V3 Bulker pattern.
     * @param _user The user address for all actions
     * @param _actions Array of BatchAction enum values (DEPOSIT=0, EXECUTE_ORDER=1, EXECUTE_PRE_ORDER=2, UNWIND_POSITION=3)
     * @param _data Array of encoded action parameters corresponding to each action
     */
    function executeBatch(
        address _user,
        ILendingMarketController.BatchAction[] calldata _actions,
        bytes[] calldata _data
    ) external {
        if (_actions.length != _data.length) revert InvalidBatchData();

        // Track unique currencies used in this batch for final collateral check
        bytes32[] memory currenciesUsed = new bytes32[](_actions.length);
        uint256 currencyCount = 0;
        uint256 totalNativeAmount = 0;

        for (uint256 i = 0; i < _actions.length; ) {
            ILendingMarketController.BatchAction action = _actions[i];
            bytes calldata data = _data[i];

            if (action == ILendingMarketController.BatchAction.DEPOSIT) {
                DepositActionArgs memory args = abi.decode(data, (DepositActionArgs));

                // Check if this is a native token deposit
                address tokenAddress = AddressResolverLib.tokenVault().getTokenAddress(args.ccy);
                bool isNative = TransferHelper.isNative(tokenAddress);
                uint256 valueToSend = 0;

                if (isNative) {
                    valueToSend = args.amount;
                    totalNativeAmount += args.amount;
                }

                AddressResolverLib.tokenVault().depositFrom{value: valueToSend}(
                    args.from,
                    args.ccy,
                    args.amount
                );
            } else if (action == ILendingMarketController.BatchAction.EXECUTE_ORDER) {
                ExecuteOrderActionArgs memory args = abi.decode(data, (ExecuteOrderActionArgs));
                _executeOrder(
                    args.ccy,
                    args.maturity,
                    _user,
                    args.side,
                    args.amount,
                    args.unitPrice
                );
                currencyCount = _addCurrencyIfNotExists(currenciesUsed, currencyCount, args.ccy);
            } else if (action == ILendingMarketController.BatchAction.EXECUTE_PRE_ORDER) {
                ExecutePreOrderActionArgs memory args = abi.decode(
                    data,
                    (ExecutePreOrderActionArgs)
                );
                _executePreOrder(
                    args.ccy,
                    args.maturity,
                    _user,
                    args.side,
                    args.amount,
                    args.unitPrice
                );
                currencyCount = _addCurrencyIfNotExists(currenciesUsed, currencyCount, args.ccy);
            } else if (action == ILendingMarketController.BatchAction.UNWIND_POSITION) {
                UnwindPositionActionArgs memory args = abi.decode(data, (UnwindPositionActionArgs));
                _unwindPositionWithoutCheck(args.ccy, args.maturity, _user, args.maxAmountInFV);
                currencyCount = _addCurrencyIfNotExists(currenciesUsed, currencyCount, args.ccy);
            } else {
                revert InvalidAction();
            }

            unchecked {
                ++i;
            }
        }

        // Ensure exact match between msg.value and total native amount to prevent user loss
        if (totalNativeAmount != msg.value) {
            revert InvalidBatchData();
        }

        // Perform collateral check once at the end for each unique currency
        for (uint256 i = 0; i < currencyCount; ) {
            _isCovered(_user, currenciesUsed[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Add currency to the list if it doesn't already exist
     * @dev Gas-efficient deduplication using linear search (optimal for small arrays)
     * @param currenciesUsed Array of currencies already tracked
     * @param currencyCount Current count of unique currencies
     * @param newCurrency Currency to potentially add
     * @return Updated currency count
     */
    function _addCurrencyIfNotExists(
        bytes32[] memory currenciesUsed,
        uint256 currencyCount,
        bytes32 newCurrency
    ) private pure returns (uint256) {
        // Check if currency already exists
        for (uint256 i = 0; i < currencyCount; ) {
            if (currenciesUsed[i] == newCurrency) {
                return currencyCount; // Currency already exists, return same count
            }
            unchecked {
                ++i;
            }
        }
        // Currency doesn't exist, add it and increment count
        currenciesUsed[currencyCount] = newCurrency;
        unchecked {
            return currencyCount + 1;
        }
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

    function withdrawZCToken(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _amount
    ) public {
        FundManagementLogic.cleanUpFunds(_ccy, _user);

        if (_maturity == 0) {
            _withdrawZCPerpetualToken(_ccy, _user, _amount);
        } else {
            _withdrawZCToken(_ccy, _maturity, _user, _amount);
        }
    }

    function depositZCToken(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _amount
    ) public {
        FundManagementLogic.cleanUpFunds(_ccy, _user);

        if (_maturity == 0) {
            _depositZCPerpetualToken(_ccy, _user, _amount);
        } else {
            _depositZCToken(_ccy, _maturity, _user, _amount);
        }

        FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);
    }

    function getWithdrawableZCTokenAmount(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (uint256 amount) {
        if (_maturity == 0) {
            return _getWithdrawableZCPerpetualTokenAmount(_ccy, _user);
        } else {
            return _getWithdrawableZCTokenAmount(_ccy, _maturity, _user);
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

    function _calculateFilledAmountFromFV(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amountInFV
    )
        internal
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV
        )
    {
        return
            ILendingMarket(Storage.slot().lendingMarkets[_ccy]).calculateFilledAmountFromFV(
                Storage.slot().maturityOrderBookIds[_ccy][_maturity],
                _side,
                _amountInFV
            );
    }

    function _estimateCollateralCoverage(
        EstimateCollateralCoverageParams memory _params
    ) internal view returns (uint256 coverage, bool isInsufficientDepositAmount) {
        uint256 filledAmountWithFeeInPV = _estimateFilledAmountWithFee(
            _params.ccy,
            _params.maturity,
            _params.side,
            _params.filledAmount,
            _params.filledAmountInFV,
            _params.orderFeeInFV
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

    function _estimateFilledAmountWithFee(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side side,
        uint256 filledAmount,
        uint256 filledAmountInFV,
        uint256 orderFeeInFV
    ) internal view returns (uint256) {
        if (filledAmountInFV == 0) {
            return 0;
        }

        uint256 filledAmountWithFeeInFV = filledAmountInFV;

        if (side == ProtocolTypes.Side.LEND) {
            filledAmountWithFeeInFV -= orderFeeInFV;
        } else {
            filledAmountWithFeeInFV += orderFeeInFV;
        }

        ILendingMarket lendingMarket = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint256 minimumReliableAmount = AddressResolverLib
            .currencyController()
            .convertFromBaseCurrency(_ccy, lendingMarket.minimumReliableAmountInBaseCurrency());

        uint256 marketUnitPrice;
        if (filledAmount < minimumReliableAmount) {
            marketUnitPrice = lendingMarket.getMarketUnitPrice(
                Storage.slot().maturityOrderBookIds[_ccy][_maturity]
            );
        }

        if (marketUnitPrice == 0) {
            marketUnitPrice = (filledAmount * Constants.PRICE_DIGIT).div(filledAmountInFV);
        }

        return (filledAmountWithFeeInFV * marketUnitPrice).div(Constants.PRICE_DIGIT);
    }

    function _executeOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) internal {
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
    }

    function _executePreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) internal {
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
    }

    function _unwindPositionWithoutCheck(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _maxAmountInFV
    ) internal returns (uint256 filledAmount, uint256 filledAmountInFV, uint256 feeInFV) {
        FundManagementLogic.cleanUpFunds(_ccy, _user);

        {
            int256 futureValue = FundManagementLogic
                .getActualFunds(_ccy, _maturity, _user, 0)
                .futureValue;

            // Apply cap if specified
            if (_maxAmountInFV > 0) {
                if (futureValue > 0 && futureValue.toUint256() > _maxAmountInFV) {
                    futureValue = _maxAmountInFV.toInt256();
                } else if (futureValue < 0 && (-futureValue).toUint256() > _maxAmountInFV) {
                    futureValue = -_maxAmountInFV.toInt256();
                }
            }

            FilledOrder memory filledOrder;
            PartiallyFilledOrder memory partiallyFilledOrder;
            ProtocolTypes.Side side;

            (filledOrder, partiallyFilledOrder, feeInFV, side) = _unwindPosition(
                _ccy,
                _maturity,
                _user,
                futureValue
            );

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
                side == ProtocolTypes.Side.LEND
                    ? ProtocolTypes.Side.BORROW
                    : ProtocolTypes.Side.LEND,
                partiallyFilledOrder
            );

            // Updates the pending order amount for marker's orders.
            // Since the partially filled order is updated with `updateFundsForMaker()`,
            // its amount is subtracted from `pendingOrderAmounts`.
            Storage.slot().pendingOrderAmounts[_ccy][_maturity] +=
                filledOrder.amount -
                partiallyFilledOrder.amount;

            filledAmount = filledOrder.amount;
            filledAmountInFV = filledOrder.futureValue;
        }

        // When the market is the nearest market and the user has only GV, a user still has future value after unwinding.
        // For that case, the `registerCurrencyAndMaturity` function needs to be called again.
        (int256 currentFutureValue, ) = IFutureValueVault(Storage.slot().futureValueVaults[_ccy])
            .getBalance(Storage.slot().maturityOrderBookIds[_ccy][_maturity], _user);

        if (currentFutureValue != 0) {
            FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);
        }
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

    function _withdrawZCToken(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _amount
    ) internal {
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];
        uint256 maxWithdrawableAmount = _getWithdrawableZCTokenAmount(_ccy, _maturity, _user);

        if (maxWithdrawableAmount < _amount) {
            _amount = maxWithdrawableAmount;
        }

        if (_amount == 0) revert AmountIsZero();

        uint256 lockedAmount = IFutureValueVault(Storage.slot().futureValueVaults[_ccy]).lock(
            orderBookId,
            _user,
            _amount,
            _maturity
        );
        IZCToken(Storage.slot().zcTokens[_ccy][_maturity]).mint(_user, lockedAmount);
    }

    function _depositZCToken(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _amount
    ) internal {
        IZCToken token = IZCToken(Storage.slot().zcTokens[_ccy][_maturity]);
        uint256 balance = token.balanceOf(_user);

        if (balance == 0) {
            revert AmountIsZero();
        }

        if (balance < _amount) {
            _amount = balance;
        }

        token.burn(_user, _amount);
        IFutureValueVault(Storage.slot().futureValueVaults[_ccy]).unlock(
            Storage.slot().maturityOrderBookIds[_ccy][_maturity],
            _user,
            _amount,
            _maturity
        );
    }

    function _withdrawZCPerpetualToken(bytes32 _ccy, address _user, uint256 _amount) internal {
        uint256 maxWithdrawableAmount = _getWithdrawableZCPerpetualTokenAmount(_ccy, _user);

        if (maxWithdrawableAmount < _amount) {
            _amount = maxWithdrawableAmount;
        }

        if (_amount == 0) revert AmountIsZero();

        uint256 lockedAmount = AddressResolverLib.genesisValueVault().lock(_ccy, _user, _amount);
        IZCToken(Storage.slot().zcTokens[_ccy][0]).mint(_user, lockedAmount);
    }

    function _depositZCPerpetualToken(bytes32 _ccy, address _user, uint256 _amount) internal {
        IZCToken token = IZCToken(Storage.slot().zcTokens[_ccy][0]);
        uint256 balance = token.balanceOf(_user);

        if (balance == 0) {
            revert AmountIsZero();
        }

        if (balance < _amount) {
            _amount = balance;
        }

        token.burn(_user, _amount);
        AddressResolverLib.genesisValueVault().unlock(_ccy, _user, _amount);
    }

    function _getWithdrawableZCTokenAmount(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) internal view returns (uint256 amount) {
        (uint256 withdrawableAmount, bool hasAllocatedCollateral) = _getWithdrawableAmount(
            _ccy,
            _user
        );

        FundManagementLogic.ActualFunds memory funds = FundManagementLogic.getActualFunds(
            _ccy,
            _maturity,
            _user,
            0
        );
        int256 presentValue = funds.presentValue - funds.genesisValueInPV;
        int256 futureValue = funds.futureValue - funds.genesisValueInFV;

        if (futureValue <= 0) {
            return 0;
        } else if (!hasAllocatedCollateral || withdrawableAmount >= presentValue.toUint256()) {
            return futureValue.toUint256();
        } else {
            return FundManagementLogic.calculateFVFromPV(_ccy, _maturity, withdrawableAmount);
        }
    }

    function _getWithdrawableZCPerpetualTokenAmount(
        bytes32 _ccy,
        address _user
    ) internal view returns (uint256 amount) {
        (uint256 withdrawableAmount, bool hasAllocatedCollateral) = _getWithdrawableAmount(
            _ccy,
            _user
        );

        FundManagementLogic.ActualFunds memory funds = FundManagementLogic.getActualFunds(
            _ccy,
            0,
            _user,
            0
        );

        if (funds.genesisValue <= 0) {
            return 0;
        } else if (
            !hasAllocatedCollateral || withdrawableAmount >= funds.genesisValueInPV.toUint256()
        ) {
            return funds.genesisValue.toUint256();
        } else {
            int256 withdrawableAmountInFV = FundManagementLogic.calculateFVFromPV(
                _ccy,
                AddressResolverLib.genesisValueVault().getCurrentMaturity(_ccy),
                withdrawableAmount.toInt256()
            );

            return
                AddressResolverLib
                    .genesisValueVault()
                    .calculateGVFromFV(_ccy, 0, withdrawableAmountInFV)
                    .toUint256();
        }
    }

    function _getWithdrawableAmount(
        bytes32 _ccy,
        address _user
    ) internal view returns (uint256 withdrawableAmount, bool hasAllocatedCollateral) {
        ILendingMarketController.AdditionalFunds memory emptyAdditionalFunds;
        uint256 liquidationThresholdRate = AddressResolverLib
            .tokenVault()
            .getLiquidationThresholdRate();
        ILendingMarketController.CalculatedFunds memory funds = FundManagementLogic.calculateFunds(
            _ccy,
            _user,
            emptyAdditionalFunds,
            liquidationThresholdRate
        );

        uint256[] memory amounts = new uint256[](2);
        (amounts[0], amounts[1], ) = AddressResolverLib.tokenVault().getCollateralDetail(_user);
        amounts = AddressResolverLib.currencyController().convertFromBaseCurrency(_ccy, amounts);

        uint256 totalCollateral = amounts[0];
        uint256 totalUsedCollateral = amounts[1];

        if (totalUsedCollateral == 0) {
            return (totalCollateral, false);
        }

        uint256 haircut = AddressResolverLib.currencyController().getHaircut(_ccy);
        uint256 discountedUnallocatedCollateralAmount = (funds.unallocatedCollateralAmount *
            haircut).div(Constants.PCT_DIGIT);

        uint256 availableAmount = (totalCollateral *
            Constants.PCT_DIGIT -
            totalUsedCollateral *
            liquidationThresholdRate).div(Constants.PCT_DIGIT);

        if (haircut != 0 && funds.unallocatedCollateralAmount != 0) {
            uint256 allocatedAmount = funds.claimableAmount - funds.unallocatedCollateralAmount;

            if (availableAmount <= discountedUnallocatedCollateralAmount) {
                return ((availableAmount * Constants.PCT_DIGIT).div(haircut), true);
            } else if (availableAmount <= discountedUnallocatedCollateralAmount + allocatedAmount) {
                // If the available amount is insufficient, unallocated collateral, which is discounted by a haircut and used between different currencies,
                // is used first. Then, the allocated collateral, which is used to offset positions in the same currency, is used for the rest of the amount.
                // NOTE: The formula is:
                // allocatedCollateralAmount = availableAmount - discountedUnallocatedCollateralAmount
                // totalWithdrawableAmount = allocatedCollateralAmount + unallocatedCollateralAmount
                return (
                    funds.unallocatedCollateralAmount +
                        availableAmount -
                        discountedUnallocatedCollateralAmount,
                    true
                );
            } else {
                return (availableAmount, true);
            }
        } else {
            return (availableAmount, funds.unallocatedCollateralAmount != 0);
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
