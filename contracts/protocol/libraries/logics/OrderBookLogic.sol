// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {OrderStatisticsTreeLib, PartiallyFilledOrder, OrderItem} from "../OrderStatisticsTreeLib.sol";
import {Constants} from "../Constants.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, MarketOrder} from "../../storages/LendingMarketStorage.sol";

library OrderBookLogic {
    using OrderStatisticsTreeLib for OrderStatisticsTreeLib.Tree;
    using RoundingUint256 for uint256;

    function getHighestLendingUnitPrice() public view returns (uint256) {
        return Storage.slot().lendOrders[Storage.slot().maturity].last();
    }

    function getLowestBorrowingUnitPrice() public view returns (uint256) {
        uint256 unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].first();
        return unitPrice == 0 ? Constants.PRICE_DIGIT : unitPrice;
    }

    function checkBorrowOrderExist() external view returns (bool) {
        return Storage.slot().borrowOrders[Storage.slot().maturity].hasOrders();
    }

    function checkLendOrderExist() external view returns (bool) {
        return Storage.slot().lendOrders[Storage.slot().maturity].hasOrders();
    }

    function getLendOrderBook(uint256 _limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        unitPrices = new uint256[](_limit);
        amounts = new uint256[](_limit);
        quantities = new uint256[](_limit);

        uint256 unitPrice = Storage.slot().lendOrders[Storage.slot().maturity].last();
        unitPrices[0] = unitPrice;
        amounts[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
            unitPrice
        );
        quantities[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(unitPrice);

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = Storage.slot().lendOrders[Storage.slot().maturity].prev(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
                unitPrice
            );
            quantities[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(
                unitPrice
            );
        }
    }

    function getBorrowOrderBook(uint256 _limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        unitPrices = new uint256[](_limit);
        amounts = new uint256[](_limit);
        quantities = new uint256[](_limit);

        uint256 unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].first();
        unitPrices[0] = unitPrice;
        amounts[0] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(
            unitPrice
        );
        quantities[0] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(
            unitPrice
        );

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].next(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(
                unitPrice
            );
            quantities[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(
                unitPrice
            );
        }
    }

    function getOrder(uint48 _orderId)
        external
        view
        returns (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            address maker,
            uint256 amount,
            uint256 timestamp
        )
    {
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];

        OrderItem memory orderItem;
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            orderItem = Storage.slot().lendOrders[marketOrder.maturity].getOrderById(
                marketOrder.unitPrice,
                _orderId
            );
        } else {
            orderItem = Storage.slot().borrowOrders[marketOrder.maturity].getOrderById(
                marketOrder.unitPrice,
                _orderId
            );
        }

        if (orderItem.maker != address(0)) {
            return (
                marketOrder.side,
                marketOrder.unitPrice,
                marketOrder.maturity,
                orderItem.maker,
                orderItem.amount,
                orderItem.timestamp
            );
        }
    }

    function getTotalAmountFromLendOrders(address _user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = getLendOrderIds(_user);

        maturity = Storage.slot().userCurrentMaturities[_user];

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[activeOrderIds[i]];
            // Sum future values in the current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = Storage
                .slot()
                .lendOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.unitPrice, activeOrderIds[i]);
            activeAmount += orderItem.amount;
        }

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveOrderIds[i]];
            if (maturity == 0) {
                maturity = marketOrder.maturity;
            }
            // Sum future values in the maturity of orders
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            OrderItem memory orderItem = Storage
                .slot()
                .lendOrders[marketOrder.maturity]
                .getOrderById(marketOrder.unitPrice, inActiveOrderIds[i]);
            inactiveAmount += orderItem.amount;

            // Check if the order is filled by Itayose.
            // If the order is filled by Itayose, the opening unit price is used instead of the order's one.
            uint256 unitPrice = marketOrder.unitPrice;
            if (Storage.slot().isPreOrder[inActiveOrderIds[i]] == true) {
                uint256 openingUnitPrice = Storage.slot().openingUnitPrices[marketOrder.maturity];
                unitPrice = _getUnitPriceForPreLendOrder(openingUnitPrice, unitPrice);
            }

            inactiveFutureValue += (orderItem.amount * Constants.PRICE_DIGIT).div(unitPrice);
        }
    }

    function getTotalAmountFromBorrowOrders(address _user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = getBorrowOrderIds(
            _user
        );

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[activeOrderIds[i]];
            // Sum future values in the current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = Storage
                .slot()
                .borrowOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.unitPrice, activeOrderIds[i]);
            activeAmount += orderItem.amount;
        }

        maturity = Storage.slot().userCurrentMaturities[_user];

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveOrderIds[i]];
            // Sum future values in the maturity of orders
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            OrderItem memory orderItem = Storage
                .slot()
                .borrowOrders[marketOrder.maturity]
                .getOrderById(marketOrder.unitPrice, inActiveOrderIds[i]);
            inactiveAmount += orderItem.amount;

            // Check if the order is filled by Itayose.
            // If the order is filled by Itayose, the opening unit price is used instead of the order's one.
            uint256 unitPrice = marketOrder.unitPrice;
            if (Storage.slot().isPreOrder[inActiveOrderIds[i]] == true) {
                uint256 openingUnitPrice = Storage.slot().openingUnitPrices[marketOrder.maturity];
                unitPrice = _getUnitPriceForPreBorrowOrder(openingUnitPrice, unitPrice);
            }

            inactiveFutureValue += (orderItem.amount * Constants.PRICE_DIGIT).div(unitPrice);
        }
    }

    function getLendOrderIds(address _user)
        public
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        uint256 activeOrderCount = 0;
        uint256 inActiveOrderCount = 0;
        bool isPastMaturity = Storage.slot().userCurrentMaturities[_user] !=
            Storage.slot().maturity;

        activeOrderIds = new uint48[](
            isPastMaturity ? 0 : Storage.slot().activeLendOrderIds[_user].length
        );
        inActiveOrderIds = new uint48[](Storage.slot().activeLendOrderIds[_user].length);

        for (uint256 i = 0; i < Storage.slot().activeLendOrderIds[_user].length; i++) {
            uint48 orderId = Storage.slot().activeLendOrderIds[_user][i];
            MarketOrder memory marketOrder = Storage.slot().orders[orderId];

            if (
                !Storage
                    .slot()
                    .lendOrders[Storage.slot().userCurrentMaturities[_user]]
                    .isActiveOrderId(marketOrder.unitPrice, orderId)
            ) {
                inActiveOrderCount += 1;
                inActiveOrderIds[i - activeOrderCount] = orderId;
                if (!isPastMaturity) {
                    assembly {
                        mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                    }
                }
            } else {
                if (!isPastMaturity) {
                    activeOrderCount += 1;
                    activeOrderIds[i - inActiveOrderCount] = orderId;
                }
                assembly {
                    mstore(inActiveOrderIds, sub(mload(inActiveOrderIds), 1))
                }
            }
        }
    }

    function getBorrowOrderIds(address _user)
        public
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        uint256 activeOrderCount = 0;
        uint256 inActiveOrderCount = 0;
        bool isPastMaturity = Storage.slot().userCurrentMaturities[_user] !=
            Storage.slot().maturity;

        activeOrderIds = new uint48[](
            isPastMaturity ? 0 : Storage.slot().activeBorrowOrderIds[_user].length
        );
        inActiveOrderIds = new uint48[](Storage.slot().activeBorrowOrderIds[_user].length);

        for (uint256 i = 0; i < Storage.slot().activeBorrowOrderIds[_user].length; i++) {
            uint48 orderId = Storage.slot().activeBorrowOrderIds[_user][i];
            MarketOrder memory marketOrder = Storage.slot().orders[orderId];

            if (
                !Storage
                    .slot()
                    .borrowOrders[Storage.slot().userCurrentMaturities[_user]]
                    .isActiveOrderId(marketOrder.unitPrice, orderId)
            ) {
                inActiveOrderCount += 1;
                inActiveOrderIds[i - activeOrderCount] = orderId;
                if (!isPastMaturity) {
                    assembly {
                        mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                    }
                }
            } else {
                activeOrderCount += 1;
                if (!isPastMaturity) {
                    activeOrderIds[i - inActiveOrderCount] = orderId;
                }
                assembly {
                    mstore(inActiveOrderIds, sub(mload(inActiveOrderIds), 1))
                }
            }
        }
    }

    function estimateFilledAmount(ProtocolTypes.Side _side, uint256 _futureValue)
        external
        view
        returns (uint256 amount)
    {
        if (_side == ProtocolTypes.Side.BORROW) {
            return
                Storage.slot().lendOrders[Storage.slot().maturity].estimateDroppedAmountFromRight(
                    _futureValue
                );
        } else {
            return
                Storage.slot().borrowOrders[Storage.slot().maturity].estimateDroppedAmountFromLeft(
                    _futureValue
                );
        }
    }

    function insertOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    ) external returns (uint48 orderId) {
        orderId = _nextOrderId();
        Storage.slot().orders[orderId] = MarketOrder(
            _side,
            _unitPrice,
            Storage.slot().maturity,
            block.timestamp
        );

        if (_side == ProtocolTypes.Side.LEND) {
            Storage.slot().lendOrders[Storage.slot().maturity].insertOrder(
                _unitPrice,
                orderId,
                _user,
                _amount
            );
            Storage.slot().activeLendOrderIds[_user].push(orderId);
        } else if (_side == ProtocolTypes.Side.BORROW) {
            Storage.slot().borrowOrders[Storage.slot().maturity].insertOrder(
                _unitPrice,
                orderId,
                _user,
                _amount
            );
            Storage.slot().activeBorrowOrderIds[_user].push(orderId);
        }
    }

    function dropOrders(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _futureValue,
        uint256 _unitPrice
    )
        external
        returns (
            uint256 filledUnitPrice,
            uint256 filledAmount,
            uint256 filledFutureValue,
            uint48 partiallyFilledOrderId,
            address partiallyFilledMaker,
            uint256 partiallyFilledAmount,
            uint256 partiallyFilledFutureValue,
            uint256 remainingAmount
        )
    {
        PartiallyFilledOrder memory partiallyFilledOrder;

        if (_side == ProtocolTypes.Side.BORROW) {
            (
                filledUnitPrice,
                filledAmount,
                filledFutureValue,
                remainingAmount,
                partiallyFilledOrder
            ) = Storage.slot().lendOrders[Storage.slot().maturity].dropRight(
                _amount,
                _unitPrice,
                _futureValue
            );
        } else if (_side == ProtocolTypes.Side.LEND) {
            (
                filledUnitPrice,
                filledAmount,
                filledFutureValue,
                remainingAmount,
                partiallyFilledOrder
            ) = Storage.slot().borrowOrders[Storage.slot().maturity].dropLeft(
                _amount,
                _unitPrice,
                _futureValue
            );
        }

        partiallyFilledOrderId = partiallyFilledOrder.orderId;
        partiallyFilledMaker = partiallyFilledOrder.maker;
        partiallyFilledAmount = partiallyFilledOrder.amount;
        partiallyFilledFutureValue = partiallyFilledOrder.futureValue;
    }

    function cleanLendOrders(address _user, uint256 _maturity)
        external
        returns (
            uint48[] memory orderIds,
            uint256 activeOrderCount,
            uint256 removedFutureValue,
            uint256 removedOrderAmount
        )
    {
        (
            uint48[] memory activeLendOrderIds,
            uint48[] memory inActiveLendOrderIds
        ) = getLendOrderIds(_user);

        Storage.slot().activeLendOrderIds[_user] = activeLendOrderIds;
        activeOrderCount = activeLendOrderIds.length;
        uint256 inactiveOrderCount = inActiveLendOrderIds.length;
        orderIds = new uint48[](inactiveOrderCount);
        OrderStatisticsTreeLib.Tree storage orders = Storage.slot().lendOrders[_maturity];
        uint256 openingUnitPrice = Storage.slot().openingUnitPrices[_maturity];

        for (uint256 i = 0; i < inactiveOrderCount; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveLendOrderIds[i]];
            uint256 unitPrice = Storage.slot().isPreOrder[inActiveLendOrderIds[i]] == true
                ? _getUnitPriceForPreLendOrder(openingUnitPrice, marketOrder.unitPrice)
                : marketOrder.unitPrice;
            OrderItem memory orderItem = orders.getOrderById(unitPrice, inActiveLendOrderIds[i]);
            removedFutureValue += orders.getFutureValue(unitPrice, inActiveLendOrderIds[i]);
            removedOrderAmount += orderItem.amount;

            orderIds[i] = orderItem.orderId;
        }
    }

    function cleanBorrowOrders(address _user, uint256 _maturity)
        external
        returns (
            uint48[] memory orderIds,
            uint256 activeOrderCount,
            uint256 removedFutureValue,
            uint256 removedOrderAmount
        )
    {
        (
            uint48[] memory activeBorrowOrderIds,
            uint48[] memory inActiveBorrowOrderIds
        ) = getBorrowOrderIds(_user);

        Storage.slot().activeBorrowOrderIds[_user] = activeBorrowOrderIds;
        activeOrderCount = activeBorrowOrderIds.length;
        uint256 inactiveOrderCount = inActiveBorrowOrderIds.length;
        orderIds = new uint48[](inactiveOrderCount);
        OrderStatisticsTreeLib.Tree storage orders = Storage.slot().borrowOrders[_maturity];
        uint256 openingUnitPrice = Storage.slot().openingUnitPrices[_maturity];

        for (uint256 i = 0; i < inactiveOrderCount; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveBorrowOrderIds[i]];
            uint256 unitPrice = Storage.slot().isPreOrder[inActiveBorrowOrderIds[i]] == true
                ? _getUnitPriceForPreBorrowOrder(openingUnitPrice, marketOrder.unitPrice)
                : marketOrder.unitPrice;
            OrderItem memory orderItem = orders.getOrderById(unitPrice, inActiveBorrowOrderIds[i]);
            removedFutureValue += orders.getFutureValue(unitPrice, inActiveBorrowOrderIds[i]);

            removedOrderAmount += orderItem.amount;

            orderIds[i] = orderItem.orderId;
        }
    }

    function removeOrder(address _user, uint48 _orderId)
        external
        returns (
            ProtocolTypes.Side,
            uint256,
            uint256
        )
    {
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];
        uint256 removedAmount;
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            removedAmount = Storage.slot().lendOrders[Storage.slot().maturity].removeOrder(
                marketOrder.unitPrice,
                _orderId
            );
            _removeOrderIdFromOrders(Storage.slot().activeLendOrderIds[_user], _orderId);
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            removedAmount = Storage.slot().borrowOrders[Storage.slot().maturity].removeOrder(
                marketOrder.unitPrice,
                _orderId
            );
            _removeOrderIdFromOrders(Storage.slot().activeBorrowOrderIds[_user], _orderId);
        }

        return (marketOrder.side, removedAmount, marketOrder.unitPrice);
    }

    function getOpeningUnitPrice()
        external
        view
        returns (uint256 openingUnitPrice, uint256 totalOffsetAmount)
    {
        uint256 lendUnitPrice = getHighestLendingUnitPrice();
        uint256 borrowUnitPrice = getLowestBorrowingUnitPrice();
        uint256 lendAmount = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
            lendUnitPrice
        );
        uint256 borrowAmount = Storage
            .slot()
            .borrowOrders[Storage.slot().maturity]
            .getNodeTotalAmount(borrowUnitPrice);

        OrderStatisticsTreeLib.Tree storage borrowOrders = Storage.slot().borrowOrders[
            Storage.slot().maturity
        ];
        OrderStatisticsTreeLib.Tree storage lendOrders = Storage.slot().lendOrders[
            Storage.slot().maturity
        ];

        // return mid price when no lending and borrowing orders overwrap
        if (borrowUnitPrice > lendUnitPrice) {
            openingUnitPrice = (lendUnitPrice + borrowUnitPrice).div(2);
            return (openingUnitPrice, 0);
        }

        while (borrowUnitPrice <= lendUnitPrice && borrowUnitPrice > 0 && lendUnitPrice > 0) {
            if (lendAmount > borrowAmount) {
                openingUnitPrice = lendUnitPrice;
                totalOffsetAmount += borrowAmount;
                lendAmount -= borrowAmount;
                borrowUnitPrice = borrowOrders.next(borrowUnitPrice);
                borrowAmount = borrowOrders.getNodeTotalAmount(borrowUnitPrice);
            } else if (lendAmount < borrowAmount) {
                openingUnitPrice = borrowUnitPrice;
                totalOffsetAmount += lendAmount;
                borrowAmount -= lendAmount;
                lendUnitPrice = lendOrders.prev(lendUnitPrice);
                lendAmount = lendOrders.getNodeTotalAmount(lendUnitPrice);
            } else {
                openingUnitPrice = (lendUnitPrice + borrowUnitPrice).div(2);
                totalOffsetAmount += lendAmount;
                lendUnitPrice = lendOrders.prev(lendUnitPrice);
                borrowUnitPrice = borrowOrders.next(borrowUnitPrice);
                lendAmount = lendOrders.getNodeTotalAmount(lendUnitPrice);
                borrowAmount = borrowOrders.getNodeTotalAmount(borrowUnitPrice);
            }
        }
    }

    function getBorrowCircuitBreakerThreshold(uint256 _circuitBreakerLimitRange, uint256 price)
        internal
        pure
        returns (uint256 cbThresholdUnitPrice)
    {
        uint256 num = price * 100000000;
        uint256 den = 100000000 +
            _circuitBreakerLimitRange *
            10000 -
            _circuitBreakerLimitRange *
            price;
        cbThresholdUnitPrice = num.div(den);

        cbThresholdUnitPrice = price - cbThresholdUnitPrice >
            Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD
            ? price - Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD
            : cbThresholdUnitPrice;
        cbThresholdUnitPrice = cbThresholdUnitPrice < 1 ? 1 : cbThresholdUnitPrice;
    }

    function getLendCircuitBreakerThreshold(uint256 _circuitBreakerLimitRange, uint256 price)
        internal
        pure
        returns (uint256 cbThresholdUnitPrice)
    {
        uint256 num = price * 100000000;
        uint256 den = 100000000 -
            _circuitBreakerLimitRange *
            10000 +
            _circuitBreakerLimitRange *
            price;
        cbThresholdUnitPrice = num.div(den);

        cbThresholdUnitPrice = cbThresholdUnitPrice - price >
            Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD
            ? price + Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD
            : cbThresholdUnitPrice;
        cbThresholdUnitPrice = cbThresholdUnitPrice > Constants.PRICE_DIGIT
            ? Constants.PRICE_DIGIT
            : cbThresholdUnitPrice;
    }

    function checkCircuitBreakerThreshold(
        ProtocolTypes.Side _side,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange
    )
        external
        returns (
            bool isFilled,
            uint256 executedUnitPrice,
            bool ignoreRemainingAmount
        )
    {
        uint256 cbThresholdUnitPrice = Storage.slot().circuitBreakerThresholdUnitPrices[
            block.number
        ][_side];
        bool isLend = _side == ProtocolTypes.Side.LEND;
        bool orderExists;
        uint256 bestUnitPrice;

        if (isLend) {
            bestUnitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].first();
            orderExists = bestUnitPrice != 0;

            if (orderExists && cbThresholdUnitPrice == 0) {
                cbThresholdUnitPrice = getLendCircuitBreakerThreshold(
                    _circuitBreakerLimitRange,
                    bestUnitPrice
                );
                Storage.slot().circuitBreakerThresholdUnitPrices[block.number][
                        _side
                    ] = cbThresholdUnitPrice;
            }
        } else {
            bestUnitPrice = Storage.slot().lendOrders[Storage.slot().maturity].last();
            orderExists = bestUnitPrice != 0;

            if (orderExists && cbThresholdUnitPrice == 0) {
                cbThresholdUnitPrice = getBorrowCircuitBreakerThreshold(
                    _circuitBreakerLimitRange,
                    bestUnitPrice
                );

                Storage.slot().circuitBreakerThresholdUnitPrices[block.number][
                        _side
                    ] = cbThresholdUnitPrice;
            }
        }

        if (_unitPrice == 0 && !orderExists) revert("Order not found");

        if (
            _unitPrice == 0 ||
            (orderExists &&
                ((isLend && _unitPrice > cbThresholdUnitPrice) ||
                    (!isLend && _unitPrice < cbThresholdUnitPrice)))
        ) {
            executedUnitPrice = cbThresholdUnitPrice;
            ignoreRemainingAmount = true;
        } else {
            executedUnitPrice = _unitPrice;
            ignoreRemainingAmount = false;
        }

        isFilled = isLend
            ? (bestUnitPrice == 0 ? Constants.PRICE_DIGIT : bestUnitPrice) <= executedUnitPrice
            : bestUnitPrice >= executedUnitPrice;
    }

    /**
     * @notice Increases and returns id of last order in order book.
     * @return The new order id
     */
    function _nextOrderId() internal returns (uint48) {
        Storage.slot().lastOrderId++;
        return Storage.slot().lastOrderId;
    }

    function _removeOrderIdFromOrders(uint48[] storage orders, uint256 orderId) internal {
        uint256 lastOrderIndex = orders.length - 1;
        for (uint256 i = 0; i <= lastOrderIndex; i++) {
            if (orders[i] == orderId) {
                if (i != lastOrderIndex) {
                    uint48 lastOrderId = orders[lastOrderIndex];
                    orders[i] = lastOrderId;
                }

                orders.pop();
                break;
            }
        }
    }

    function _getUnitPriceForPreLendOrder(uint256 openingUnitPrice, uint256 unitPrice)
        private
        pure
        returns (uint256)
    {
        return openingUnitPrice < unitPrice ? openingUnitPrice : unitPrice;
    }

    function _getUnitPriceForPreBorrowOrder(uint256 openingUnitPrice, uint256 unitPrice)
        private
        pure
        returns (uint256)
    {
        return openingUnitPrice > unitPrice ? openingUnitPrice : unitPrice;
    }
}
