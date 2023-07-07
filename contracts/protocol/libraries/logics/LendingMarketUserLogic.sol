// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "../../../dependencies/openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/contracts/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {Constants} from "../Constants.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {LendingMarketConfigurationLogic} from "./LendingMarketConfigurationLogic.sol";
import {LendingMarketOperationLogic} from "./LendingMarketOperationLogic.sol";
import {FundManagementLogic} from "./FundManagementLogic.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";
import {ItayoseLog} from "../../storages/LendingMarketStorage.sol";

library LendingMarketUserLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeCast for int256;
    using RoundingUint256 for uint256;

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

        require(
            AddressResolverLib.tokenVault().isCovered(_user, _ccy, _amount, _side),
            "Not enough collateral"
        );

        uint256 circuitBreakerLimitRange = LendingMarketConfigurationLogic
            .getCircuitBreakerLimitRange(_ccy);

        (
            ILendingMarket.FilledOrder memory filledOrder,
            ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder
        ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).executeOrder(
                _side,
                _user,
                _amount,
                _unitPrice,
                circuitBreakerLimitRange
            );

        uint256 filledAmount = filledOrder.amount;

        // The case that an order is placed in the order book
        if ((filledAmount + filledOrder.ignoredAmount) != _amount) {
            activeOrderCount += 1;
        }

        require(activeOrderCount <= Constants.MAXIMUM_ORDER_COUNT, "Too many active orders");

        updateFundsForTaker(
            _ccy,
            _maturity,
            _user,
            _side,
            filledAmount,
            filledOrder.futureValue,
            filledOrder.unitPrice
        );

        updateFundsForMaker(
            _ccy,
            _maturity,
            _side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        Storage.slot().usedCurrencies[_user].add(_ccy);
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

        require(
            AddressResolverLib.tokenVault().isCovered(_user, _ccy, _amount, _side),
            "Not enough collateral"
        );

        ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).executePreOrder(
            _side,
            _user,
            _amount,
            _unitPrice
        );
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
            ILendingMarket.FilledOrder memory filledOrder,
            ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder,
            ProtocolTypes.Side side
        ) = _unwindPosition(_ccy, _maturity, _user, futureValue);

        updateFundsForTaker(
            _ccy,
            _maturity,
            _user,
            side,
            filledOrder.amount,
            filledOrder.futureValue,
            filledOrder.unitPrice
        );

        updateFundsForMaker(
            _ccy,
            _maturity,
            side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        // When the market is the nearest market and the user has only GV, a user still has future value after unwinding.
        // For that case, the `registerCurrencyAndMaturity` function needs to be called again.
        (int256 currentFutureValue, ) = IFutureValueVault(
            Storage.slot().futureValueVaults[_ccy][
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ]
        ).getFutureValue(_user);

        if (currentFutureValue != 0) {
            FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _user);
        }
    }

    function updateFundsForTaker(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _filledAmount,
        uint256 _filledAmountInFV,
        uint256 _filledUnitPrice
    ) public {
        if (_filledAmountInFV != 0) {
            uint256 orderFeeRate = LendingMarketConfigurationLogic.getOrderFeeRate(_ccy);

            FundManagementLogic.updateFunds(
                _ccy,
                _maturity,
                _user,
                _side,
                _filledAmount,
                _filledAmountInFV,
                orderFeeRate,
                true
            );

            LendingMarketOperationLogic.updateOrderLogs(
                _ccy,
                _maturity,
                LendingMarketConfigurationLogic.getObservationPeriod(),
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
                _filledAmountInFV
            );
        }
    }

    function updateFundsForMaker(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder
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
        ILendingMarket market = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        );

        (uint48[] memory activeLendOrderIds, uint48[] memory inActiveLendOrderIds) = market
            .getLendOrderIds(_user);
        (uint48[] memory activeBorrowOrderIds, uint48[] memory inActiveBorrowOrderIds) = market
            .getBorrowOrderIds(_user);

        activeOrders = new ILendingMarketController.Order[](
            activeLendOrderIds.length + activeBorrowOrderIds.length
        );
        inactiveOrders = new ILendingMarketController.Order[](
            inActiveLendOrderIds.length + inActiveBorrowOrderIds.length
        );

        for (uint256 i; i < activeLendOrderIds.length; i++) {
            activeOrders[i] = _getActiveOrder(_ccy, market, activeLendOrderIds[i]);
        }

        for (uint256 i; i < activeBorrowOrderIds.length; i++) {
            activeOrders[activeLendOrderIds.length + i] = _getActiveOrder(
                _ccy,
                market,
                activeBorrowOrderIds[i]
            );
        }

        for (uint256 i; i < inActiveLendOrderIds.length; i++) {
            inactiveOrders[i] = _getInactiveOrder(_ccy, market, inActiveLendOrderIds[i]);
        }

        for (uint256 i; i < inActiveBorrowOrderIds.length; i++) {
            inactiveOrders[inActiveLendOrderIds.length + i] = _getInactiveOrder(
                _ccy,
                market,
                inActiveBorrowOrderIds[i]
            );
        }
    }

    function _getActiveOrder(
        bytes32 _ccy,
        ILendingMarket _market,
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
        ) = _market.getOrder(_orderId);

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

    function _getInactiveOrder(
        bytes32 _ccy,
        ILendingMarket _market,
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
        ) = _market.getOrder(_orderId);

        ItayoseLog memory itayoseLog = _market.getItayoseLog(maturity);
        if (
            isPreOrder &&
            itayoseLog.openingUnitPrice != 0 &&
            ((side == ProtocolTypes.Side.BORROW && unitPrice <= itayoseLog.lastBorrowUnitPrice) ||
                (side == ProtocolTypes.Side.LEND && unitPrice >= itayoseLog.lastLendUnitPrice))
        ) {
            unitPrice = itayoseLog.openingUnitPrice;
        }
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
            ILendingMarket.FilledOrder memory filledOrder,
            ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder,
            ProtocolTypes.Side side
        )
    {
        require(_futureValue != 0, "Future Value is zero");

        uint256 cbLimitRange = LendingMarketConfigurationLogic.getCircuitBreakerLimitRange(_ccy);
        uint256 orderFeeRate = LendingMarketConfigurationLogic.getOrderFeeRate(_ccy);
        uint256 currentMaturity = _maturity >= block.timestamp ? _maturity - block.timestamp : 0;

        if (_futureValue > 0) {
            side = ProtocolTypes.Side.BORROW;
            // To unwind all positions, calculate the future value taking into account
            // the added portion of the fee.
            // NOTE: The formula is:
            // actualRate = feeRate * (currentMaturity / SECONDS_IN_YEAR)
            // amount = totalAmountInFV / (1 + actualRate)
            uint256 amountInFV = (_futureValue.toUint256() *
                Constants.SECONDS_IN_YEAR *
                Constants.PCT_DIGIT).div(
                    Constants.SECONDS_IN_YEAR *
                        Constants.PCT_DIGIT +
                        (orderFeeRate * currentMaturity)
                );

            (filledOrder, partiallyFilledOrder) = ILendingMarket(
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ).unwindPosition(side, _user, amountInFV, cbLimitRange);
        } else if (_futureValue < 0) {
            side = ProtocolTypes.Side.LEND;
            // To unwind all positions, calculate the future value taking into account
            // the subtracted portion of the fee.
            // NOTE: The formula is:
            // actualRate = feeRate * (currentMaturity / SECONDS_IN_YEAR)
            // amount = totalAmountInFV / (1 - actualRate)
            uint256 amountInFV = ((-_futureValue).toUint256() *
                Constants.SECONDS_IN_YEAR *
                Constants.PCT_DIGIT).div(
                    Constants.SECONDS_IN_YEAR *
                        Constants.PCT_DIGIT -
                        (orderFeeRate * currentMaturity)
                );

            (filledOrder, partiallyFilledOrder) = ILendingMarket(
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ).unwindPosition(side, _user, amountInFV, cbLimitRange);
        }
    }
}
