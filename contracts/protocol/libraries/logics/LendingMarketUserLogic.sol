// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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

    function getOrderEstimation(ILendingMarketController.GetOrderEstimationParams memory input)
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

        (coverage, isInsufficientDepositAmount) = _calculateCollateralCoverage(
            input.ccy,
            input.maturity,
            input.user,
            input.side,
            input.additionalDepositAmount,
            input.ignoreBorrowedAmount,
            filledAmount,
            filledAmountInFV,
            orderFeeInFV,
            placedAmount
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
        require(_amount > 0, "Invalid amount");
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

        require(activeOrderCount <= Constants.MAXIMUM_ORDER_COUNT, "Too many active orders");

        updateFundsForTaker(
            _ccy,
            _maturity,
            _user,
            _side,
            filledAmount,
            filledOrder.futureValue,
            filledOrder.unitPrice,
            feeInFV
        );

        updateFundsForMaker(
            _ccy,
            _maturity,
            _side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        Storage.slot().usedCurrencies[_user].add(_ccy);

        require(AddressResolverLib.tokenVault().isCovered(_user), "Not enough collateral");
    }

    function executePreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external {
        require(_amount > 0, "Invalid amount");
        uint256 activeOrderCount = FundManagementLogic.cleanUpFunds(_ccy, _user);

        require(activeOrderCount + 1 <= Constants.MAXIMUM_ORDER_COUNT, "Too many active orders");

        FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);

        ILendingMarket(Storage.slot().lendingMarkets[_ccy]).executePreOrder(
            Storage.slot().maturityOrderBookIds[_ccy][_maturity],
            _side,
            _user,
            _amount,
            _unitPrice
        );

        Storage.slot().usedCurrencies[_user].add(_ccy);

        require(AddressResolverLib.tokenVault().isCovered(_user), "Not enough collateral");
    }

    function unwindPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external {
        int256 futureValue = FundManagementLogic
            .calculateActualFunds(_ccy, _maturity, _user)
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
            filledOrder.unitPrice,
            feeInFV
        );

        updateFundsForMaker(
            _ccy,
            _maturity,
            side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        // When the market is the nearest market and the user has only GV, a user still has future value after unwinding.
        // For that case, the `registerCurrencyAndMaturity` function needs to be called again.
        (int256 currentFutureValue, ) = IFutureValueVault(Storage.slot().futureValueVaults[_ccy])
            .getBalance(Storage.slot().maturityOrderBookIds[_ccy][_maturity], _user);

        if (currentFutureValue != 0) {
            FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);
        }

        require(AddressResolverLib.tokenVault().isCovered(_user), "Not enough collateral");
    }

    function updateFundsForTaker(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _filledAmount,
        uint256 _filledAmountInFV,
        uint256 _filledUnitPrice,
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
                _feeInFV,
                true
            );

            LendingMarketOperationLogic.updateOrderLogs(
                _ccy,
                _maturity,
                _filledUnitPrice,
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
                0,
                false
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

    function getOrders(bytes32[] memory _ccys, address _user)
        external
        view
        returns (
            ILendingMarketController.Order[] memory activeOrders,
            ILendingMarketController.Order[] memory inactiveOrders
        )
    {
        uint256 totalActiveOrderCount;
        uint256 totalInactiveOrderCount;

        ILendingMarketController.Order[][]
            memory activeOrdersList = new ILendingMarketController.Order[][](_ccys.length);
        ILendingMarketController.Order[][]
            memory inactiveOrdersList = new ILendingMarketController.Order[][](_ccys.length);

        for (uint256 i; i < _ccys.length; i++) {
            (activeOrdersList[i], inactiveOrdersList[i]) = _getOrdersPerCurrency(_ccys[i], _user);
            totalActiveOrderCount += activeOrdersList[i].length;
            totalInactiveOrderCount += inactiveOrdersList[i].length;
        }

        activeOrders = _flattenOrders(activeOrdersList, totalActiveOrderCount);
        inactiveOrders = _flattenOrders(inactiveOrdersList, totalInactiveOrderCount);
    }

    function _getOrdersPerCurrency(bytes32 _ccy, address _user)
        internal
        view
        returns (
            ILendingMarketController.Order[] memory activeOrders,
            ILendingMarketController.Order[] memory inactiveOrders
        )
    {
        uint256 totalActiveOrderCount;
        uint256 totalInactiveOrderCount;

        uint256[] memory maturities = Storage.slot().usedMaturities[_ccy][_user].values();
        ILendingMarketController.Order[][]
            memory activeOrdersList = new ILendingMarketController.Order[][](maturities.length);
        ILendingMarketController.Order[][]
            memory inactiveOrdersList = new ILendingMarketController.Order[][](maturities.length);

        for (uint256 i; i < maturities.length; i++) {
            (activeOrdersList[i], inactiveOrdersList[i]) = _getOrdersPerMarket(
                _ccy,
                maturities[i],
                _user
            );
            totalActiveOrderCount += activeOrdersList[i].length;
            totalInactiveOrderCount += inactiveOrdersList[i].length;
        }

        activeOrders = _flattenOrders(activeOrdersList, totalActiveOrderCount);
        inactiveOrders = _flattenOrders(inactiveOrdersList, totalInactiveOrderCount);
    }

    function _getOrdersPerMarket(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    )
        internal
        view
        returns (
            ILendingMarketController.Order[] memory activeOrders,
            ILendingMarketController.Order[] memory inactiveOrders
        )
    {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];

        (uint48[] memory activeLendOrderIds, uint48[] memory inActiveLendOrderIds) = market
            .getLendOrderIds(orderBookId, _user);
        (uint48[] memory activeBorrowOrderIds, uint48[] memory inActiveBorrowOrderIds) = market
            .getBorrowOrderIds(orderBookId, _user);

        activeOrders = new ILendingMarketController.Order[](
            activeLendOrderIds.length + activeBorrowOrderIds.length
        );
        inactiveOrders = new ILendingMarketController.Order[](
            inActiveLendOrderIds.length + inActiveBorrowOrderIds.length
        );

        for (uint256 i; i < activeLendOrderIds.length; i++) {
            activeOrders[i] = _getOrder(_ccy, market, orderBookId, activeLendOrderIds[i]);
        }

        for (uint256 i; i < activeBorrowOrderIds.length; i++) {
            activeOrders[activeLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                orderBookId,
                activeBorrowOrderIds[i]
            );
        }

        for (uint256 i; i < inActiveLendOrderIds.length; i++) {
            inactiveOrders[i] = _getOrder(_ccy, market, orderBookId, inActiveLendOrderIds[i]);
        }

        for (uint256 i; i < inActiveBorrowOrderIds.length; i++) {
            inactiveOrders[inActiveLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                orderBookId,
                inActiveBorrowOrderIds[i]
            );
        }
    }

    function _getOrder(
        bytes32 _ccy,
        ILendingMarket _market,
        uint8 _orderBookId,
        uint48 _orderId
    ) internal view returns (ILendingMarketController.Order memory order) {
        (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            ,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        ) = _market.getOrder(_orderBookId, _orderId);

        order = ILendingMarketController.Order(
            _orderId,
            _ccy,
            maturity,
            side,
            unitPrice,
            amount,
            timestamp,
            isPreOrder
        );
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

    function _calculateCollateralCoverage(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _additionalDepositAmount,
        bool _ignoreBorrowedAmount,
        uint256 _filledAmount,
        uint256 _filledAmountInFV,
        uint256 _orderFeeInFV,
        uint256 _placedAmount
    ) internal view returns (uint256 coverage, bool isInsufficientDepositAmount) {
        uint256 filledAmountWithFeeInFV = _filledAmountInFV;

        if (_side == ProtocolTypes.Side.LEND) {
            filledAmountWithFeeInFV -= _orderFeeInFV;
        } else {
            filledAmountWithFeeInFV += _orderFeeInFV;
        }

        uint256 filledAmountWithFeeInPV = FundManagementLogic.calculatePVFromFV(
            _ccy,
            _maturity,
            filledAmountWithFeeInFV
        );

        ILendingMarketController.AdditionalFunds memory funds;
        funds.ccy = _ccy;
        // Store the _additionalDepositAmount in the borrowedAmount,
        // because the borrowedAmount is used as collateral.
        funds.borrowedAmount = _additionalDepositAmount;

        if (_placedAmount > 0) {
            if (_side == ProtocolTypes.Side.BORROW) {
                funds.workingBorrowOrdersAmount = _placedAmount;
            } else {
                funds.workingLendOrdersAmount = _placedAmount;
            }
        }

        if (filledAmountWithFeeInPV > 0) {
            if (_side == ProtocolTypes.Side.BORROW) {
                if (!_ignoreBorrowedAmount) {
                    funds.borrowedAmount += _filledAmount;
                }
                funds.debtAmount += filledAmountWithFeeInPV;
            } else {
                funds.lentAmount += _filledAmount;
                funds.claimableAmount += filledAmountWithFeeInPV;
            }
        }

        (coverage, isInsufficientDepositAmount) = AddressResolverLib.tokenVault().calculateCoverage(
            _user,
            funds
        );
    }

    function _flattenOrders(ILendingMarketController.Order[][] memory orders, uint256 totalLength)
        internal
        pure
        returns (ILendingMarketController.Order[] memory flattened)
    {
        flattened = new ILendingMarketController.Order[](totalLength);
        uint256 index;
        for (uint256 i; i < orders.length; i++) {
            for (uint256 j; j < orders[i].length; j++) {
                flattened[index] = orders[i][j];
                index++;
            }
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
        require(_futureValue != 0, "Future Value is zero");

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
}
