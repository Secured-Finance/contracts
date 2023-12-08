// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Constants} from "../Constants.sol";
import {OrderBookLib, PlacedOrder} from "../OrderBookLib.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, ItayoseLog} from "../../storages/LendingMarketStorage.sol";
import {OrderStatisticsTreeLib} from "../OrderStatisticsTreeLib.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";

library OrderReaderLogic {
    using OrderBookLib for OrderBookLib.OrderBook;
    using OrderStatisticsTreeLib for OrderStatisticsTreeLib.Tree;
    using RoundingUint256 for uint256;

    function getOrder(
        uint256 _maturity,
        uint48 _orderId
    )
        external
        view
        returns (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            address maker,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        )
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);
        PlacedOrder memory order = orderBook.getOrder(_orderId);

        if (order.side == ProtocolTypes.Side.LEND) {
            (maker, amount) = orderBook.lendOrders.getOrderById(order.unitPrice, _orderId);
        } else {
            (maker, amount) = orderBook.borrowOrders.getOrderById(order.unitPrice, _orderId);
        }

        if (maker != address(0)) {
            side = order.side;
            timestamp = order.timestamp;
            isPreOrder = orderBook.isPreOrder[_orderId];
            unitPrice = _getOrderUnitPrice(side, _maturity, order.unitPrice, isPreOrder);
        }
    }

    function getTotalAmountFromLendOrders(
        uint256 _maturity,
        address _user
    )
        external
        view
        returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue)
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);

        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = orderBook
            .getLendOrderIds(_user);

        for (uint256 i; i < activeOrderIds.length; ) {
            PlacedOrder memory order = orderBook.getOrder(activeOrderIds[i]);
            // Sum future values in the current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            (, uint256 orderAmount) = orderBook.lendOrders.getOrderById(
                order.unitPrice,
                activeOrderIds[i]
            );
            activeAmount += orderAmount;

            unchecked {
                i++;
            }
        }

        for (uint256 i; i < inActiveOrderIds.length; ) {
            // Sum future values in the maturity of orders.
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            (uint256 presentValue, uint256 futureValue) = getLendOrderAmounts(
                orderBook,
                inActiveOrderIds[i]
            );
            inactiveAmount += presentValue;
            inactiveFutureValue += futureValue;

            unchecked {
                i++;
            }
        }
    }

    function getTotalAmountFromBorrowOrders(
        uint256 _maturity,
        address _user,
        uint256 _minUnitPrice
    )
        external
        view
        returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue)
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);

        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = orderBook
            .getBorrowOrderIds(_user);

        for (uint256 i; i < activeOrderIds.length; ) {
            // Sum future values in the current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            (uint256 presentValue, uint256 futureValue, uint256 unitPrice) = getBorrowOrderAmounts(
                orderBook,
                activeOrderIds[i]
            );

            activeAmount += unitPrice >= _minUnitPrice
                ? presentValue
                : (futureValue * _minUnitPrice).div(Constants.PRICE_DIGIT);

            unchecked {
                i++;
            }
        }

        for (uint256 i; i < inActiveOrderIds.length; ) {
            // Sum future values in the maturity of orders
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            (uint256 presentValue, uint256 futureValue, ) = getBorrowOrderAmounts(
                orderBook,
                inActiveOrderIds[i]
            );

            inactiveAmount += presentValue;
            inactiveFutureValue += futureValue;

            unchecked {
                i++;
            }
        }
    }

    function getLendOrderIds(
        uint256 _maturity,
        address _user
    ) external view returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) {
        (activeOrderIds, inActiveOrderIds) = _getOrderBook(_maturity).getLendOrderIds(_user);
    }

    function getBorrowOrderIds(
        uint256 _maturity,
        address _user
    ) external view returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) {
        (activeOrderIds, inActiveOrderIds) = _getOrderBook(_maturity).getBorrowOrderIds(_user);
    }

    function calculateFilledAmount(
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        external
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV,
            uint256 placedAmount
        )
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);

        (bool isFilled, uint256 executedUnitPrice, bool ignoreRemainingAmount, ) = orderBook
            .getOrderExecutionConditions(
                _side,
                _unitPrice,
                Storage.slot().circuitBreakerLimitRange,
                true
            );

        if (isFilled) {
            (lastUnitPrice, filledAmount, filledAmountInFV) = orderBook.calculateFilledAmount(
                _side,
                _amount,
                executedUnitPrice
            );
            placedAmount = _amount - filledAmount;
            orderFeeInFV = calculateOrderFeeAmount(orderBook.maturity, filledAmountInFV);
        } else {
            if (!ignoreRemainingAmount) {
                placedAmount = _amount;
            }
        }
    }

    function calculateOrderFeeAmount(
        uint256 _maturity,
        uint256 _amount
    ) public view returns (uint256 orderFeeAmount) {
        if (block.timestamp >= _maturity) return 0;

        uint256 currentMaturity = _maturity - block.timestamp;

        // NOTE: The formula is:
        // actualRate = feeRate * (currentMaturity / SECONDS_IN_YEAR)
        // orderFeeAmount = amount * actualRate
        orderFeeAmount = (Storage.slot().orderFeeRate * currentMaturity * _amount).div(
            Constants.SECONDS_IN_YEAR * Constants.PCT_DIGIT
        );
    }

    function getLendOrderAmounts(
        OrderBookLib.OrderBook storage orderBook,
        uint48 _orderId
    ) public view returns (uint256 presentValue, uint256 futureValue) {
        PlacedOrder memory order = orderBook.getOrder(_orderId);
        (, uint256 orderAmount) = orderBook.lendOrders.getOrderById(order.unitPrice, _orderId);

        uint256 unitPrice = _getOrderUnitPrice(
            order.side,
            order.maturity,
            order.unitPrice,
            orderBook.isPreOrder[_orderId]
        );

        presentValue = orderAmount;
        futureValue = (orderAmount * Constants.PRICE_DIGIT).div(unitPrice);
    }

    function getBorrowOrderAmounts(
        OrderBookLib.OrderBook storage orderBook,
        uint48 _orderId
    ) public view returns (uint256 presentValue, uint256 futureValue, uint256 unitPrice) {
        PlacedOrder memory order = orderBook.getOrder(_orderId);
        (, uint256 orderAmount) = orderBook.borrowOrders.getOrderById(order.unitPrice, _orderId);
        unitPrice = _getOrderUnitPrice(
            order.side,
            order.maturity,
            order.unitPrice,
            orderBook.isPreOrder[_orderId]
        );

        presentValue = orderAmount;
        futureValue = (orderAmount * Constants.PRICE_DIGIT).div(unitPrice);
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

    function _getOrderBook(
        uint256 _maturity
    ) private view returns (OrderBookLib.OrderBook storage) {
        return Storage.slot().orderBooks[_maturity];
    }
}
