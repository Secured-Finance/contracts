// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Constants} from "../Constants.sol";
import {OrderBookLib, MarketOrder} from "../OrderBookLib.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, ItayoseLog} from "../../storages/LendingMarketStorage.sol";
import {OrderStatisticsTreeLib, OrderItem} from "../OrderStatisticsTreeLib.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";

library OrderBookCalculationLogic {
    using OrderBookLib for OrderBookLib.OrderBook;
    using OrderStatisticsTreeLib for OrderStatisticsTreeLib.Tree;
    using RoundingUint256 for uint256;

    function isMatured(uint8 _orderBookId) external view returns (bool) {
        return _getOrderBook(_orderBookId).isMatured();
    }

    function getOrder(uint8 _orderBookId, uint48 _orderId)
        external
        view
        returns (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            address maker,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        )
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        MarketOrder memory marketOrder = orderBook.orders[_orderId];

        OrderItem memory orderItem;
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            orderItem = orderBook.lendOrders[marketOrder.maturity].getOrderById(
                marketOrder.unitPrice,
                _orderId
            );
        } else {
            orderItem = orderBook.borrowOrders[marketOrder.maturity].getOrderById(
                marketOrder.unitPrice,
                _orderId
            );
        }

        if (orderItem.maker != address(0)) {
            side = marketOrder.side;
            maturity = marketOrder.maturity;
            maker = orderItem.maker;
            amount = orderItem.amount;
            timestamp = orderItem.timestamp;
            isPreOrder = orderBook.isPreOrder[_orderId];
            unitPrice = _getOrderUnitPrice(side, maturity, marketOrder.unitPrice, isPreOrder);
        }
    }

    function getTotalAmountFromLendOrders(uint8 _orderBookId, address _user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);

        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = orderBook
            .getLendOrderIds(_user);
        maturity = orderBook.userCurrentMaturities[_user];

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = orderBook.orders[activeOrderIds[i]];
            // Sum future values in the current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = orderBook.lendOrders[orderBook.maturity].getOrderById(
                marketOrder.unitPrice,
                activeOrderIds[i]
            );
            activeAmount += orderItem.amount;
        }

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            // Sum future values in the maturity of orders.
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            (uint256 presentValue, uint256 futureValue) = getLendOrderAmounts(
                orderBook,
                inActiveOrderIds[i]
            );
            inactiveAmount += presentValue;
            inactiveFutureValue += futureValue;
        }
    }

    function getTotalAmountFromBorrowOrders(uint8 _orderBookId, address _user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);

        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = orderBook
            .getBorrowOrderIds(_user);
        maturity = orderBook.userCurrentMaturities[_user];

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = orderBook.orders[activeOrderIds[i]];
            // Sum future values in the current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = orderBook.borrowOrders[orderBook.maturity].getOrderById(
                marketOrder.unitPrice,
                activeOrderIds[i]
            );
            activeAmount += orderItem.amount;
        }

        maturity = orderBook.userCurrentMaturities[_user];

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            // Sum future values in the maturity of orders
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            (uint256 presentValue, uint256 futureValue) = getBorrowOrderAmounts(
                orderBook,
                inActiveOrderIds[i]
            );
            inactiveAmount += presentValue;
            inactiveFutureValue += futureValue;
        }
    }

    function getLendOrderIds(uint8 _orderBookId, address _user)
        external
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        (activeOrderIds, inActiveOrderIds) = _getOrderBook(_orderBookId).getLendOrderIds(_user);
    }

    function getBorrowOrderIds(uint8 _orderBookId, address _user)
        external
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        (activeOrderIds, inActiveOrderIds) = _getOrderBook(_orderBookId).getBorrowOrderIds(_user);
    }

    function calculateFilledAmount(
        uint8 _orderBookId,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange
    )
        external
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV
        )
    {
        return
            _getOrderBook(_orderBookId).calculateFilledAmount(
                _side,
                _amount,
                _unitPrice,
                _circuitBreakerLimitRange
            );
    }

    function getLendOrderAmounts(OrderBookLib.OrderBook storage orderBook, uint48 _orderId)
        public
        view
        returns (uint256 presentValue, uint256 futureValue)
    {
        MarketOrder memory marketOrder = orderBook.orders[_orderId];
        OrderItem memory orderItem = orderBook.lendOrders[marketOrder.maturity].getOrderById(
            marketOrder.unitPrice,
            _orderId
        );

        uint256 unitPrice = _getOrderUnitPrice(
            marketOrder.side,
            marketOrder.maturity,
            marketOrder.unitPrice,
            orderBook.isPreOrder[_orderId]
        );

        presentValue = orderItem.amount;
        futureValue = (orderItem.amount * Constants.PRICE_DIGIT).div(unitPrice);
    }

    function getBorrowOrderAmounts(OrderBookLib.OrderBook storage orderBook, uint48 _orderId)
        public
        view
        returns (uint256 presentValue, uint256 futureValue)
    {
        MarketOrder memory marketOrder = orderBook.orders[_orderId];
        OrderItem memory orderItem = orderBook.borrowOrders[marketOrder.maturity].getOrderById(
            marketOrder.unitPrice,
            _orderId
        );
        uint256 unitPrice = _getOrderUnitPrice(
            marketOrder.side,
            marketOrder.maturity,
            marketOrder.unitPrice,
            orderBook.isPreOrder[_orderId]
        );

        presentValue = orderItem.amount;
        futureValue = (orderItem.amount * Constants.PRICE_DIGIT).div(unitPrice);
    }

    function _getOrderUnitPrice(
        ProtocolTypes.Side _side,
        uint256 _maturity,
        uint256 _unitPrice,
        bool _isPreOrder
    ) private view returns (uint256) {
        if (!_isPreOrder) return _unitPrice;
        ItayoseLog memory itayoseLog = Storage.slot().itayoseLogs[_maturity];
        if (
            itayoseLog.openingUnitPrice != 0 &&
            ((_side == ProtocolTypes.Side.BORROW && _unitPrice <= itayoseLog.lastBorrowUnitPrice) ||
                (_side == ProtocolTypes.Side.LEND && _unitPrice >= itayoseLog.lastLendUnitPrice))
        ) {
            return itayoseLog.openingUnitPrice;
        } else {
            return _unitPrice;
        }
    }

    function _getOrderBook(uint8 _orderBookId)
        private
        view
        returns (OrderBookLib.OrderBook storage)
    {
        return Storage.slot().orderBooks[_orderBookId];
    }
}
