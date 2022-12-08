// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ILendingMarket} from "../interfaces/ILendingMarket.sol";
import {HitchensOrderStatisticsTreeLib, RemainingOrder, OrderItem} from "../libraries/HitchensOrderStatisticsTreeLib.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, MarketOrder} from "../storages/LendingMarketStorage.sol";

library OrderBookLogic {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    function getHighestBorrowUnitPrice() public view returns (uint256) {
        return Storage.slot().borrowOrders[Storage.slot().maturity].last();
    }

    function getLowestLendUnitPrice() public view returns (uint256) {
        return Storage.slot().lendOrders[Storage.slot().maturity].first();
    }

    function getBorrowOrderBook(uint256 _limit)
        public
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

        uint256 unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].last();
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

            unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].prev(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(
                unitPrice
            );
            quantities[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(
                unitPrice
            );
        }
    }

    function getLendOrderBook(uint256 _limit)
        public
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

        uint256 unitPrice = Storage.slot().lendOrders[Storage.slot().maturity].first();
        unitPrices[0] = unitPrice;
        amounts[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
            unitPrice
        );
        quantities[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(unitPrice);

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = Storage.slot().lendOrders[Storage.slot().maturity].next(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
                unitPrice
            );
            quantities[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(
                unitPrice
            );
        }
    }

    function getOrder(uint48 _orderId)
        public
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
        public
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = getActiveLendOrderIds(
            _user
        );

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
            inactiveFutureValue +=
                (orderItem.amount * ProtocolTypes.PRICE_DIGIT) /
                marketOrder.unitPrice;
        }
    }

    function getTotalAmountFromBorrowOrders(address _user)
        public
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        (
            uint48[] memory activeOrderIds,
            uint48[] memory inActiveOrderIds
        ) = getActiveBorrowOrderIds(_user);

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
            inactiveFutureValue +=
                (orderItem.amount * ProtocolTypes.PRICE_DIGIT) /
                marketOrder.unitPrice;
        }
    }

    function getActiveLendOrderIds(address _user)
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

    function getActiveBorrowOrderIds(address _user)
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

    function estimateFilledAmount(ProtocolTypes.Side _side, uint256 _futureValue)
        public
        view
        returns (uint256 amount)
    {
        if (_side == ProtocolTypes.Side.BORROW) {
            return
                Storage.slot().lendOrders[Storage.slot().maturity].estimateDroppedAmountFromLeft(
                    _futureValue
                );
        } else {
            return
                Storage.slot().borrowOrders[Storage.slot().maturity].estimateDroppedAmountFromRight(
                    _futureValue
                );
        }
    }

    function insertOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        bool _isInterruption
    ) public returns (uint48 orderId) {
        orderId = nextOrderId();
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
                _amount,
                _isInterruption
            );
            Storage.slot().activeLendOrderIds[_user].push(orderId);
        } else if (_side == ProtocolTypes.Side.BORROW) {
            Storage.slot().borrowOrders[Storage.slot().maturity].insertOrder(
                _unitPrice,
                orderId,
                _user,
                _amount,
                _isInterruption
            );
            Storage.slot().activeBorrowOrderIds[_user].push(orderId);
        }
    }

    function dropOrders(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        public
        returns (
            RemainingOrder memory remainingOrder,
            uint256 filledFutureValue,
            uint256 remainingAmount
        )
    {
        if (_side == ProtocolTypes.Side.BORROW) {
            (filledFutureValue, remainingAmount, remainingOrder) = Storage
                .slot()
                .lendOrders[Storage.slot().maturity]
                .dropLeft(_amount, _unitPrice);
        } else if (_side == ProtocolTypes.Side.LEND) {
            (filledFutureValue, remainingAmount, remainingOrder) = Storage
                .slot()
                .borrowOrders[Storage.slot().maturity]
                .dropRight(_amount, _unitPrice);
        }
    }

    function cleanLendOrders(address _user, uint256 _maturity)
        public
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
        ) = getActiveLendOrderIds(_user);

        Storage.slot().activeLendOrderIds[_user] = activeLendOrderIds;
        activeOrderCount = activeLendOrderIds.length;
        uint256 inactiveOrderCount = inActiveLendOrderIds.length;
        orderIds = new uint48[](inactiveOrderCount);

        for (uint256 i = 0; i < inactiveOrderCount; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveLendOrderIds[i]];
            OrderItem memory orderItem = Storage.slot().lendOrders[_maturity].getOrderById(
                marketOrder.unitPrice,
                inActiveLendOrderIds[i]
            );
            removedFutureValue += Storage.slot().lendOrders[_maturity].getFutureValue(
                marketOrder.unitPrice,
                inActiveLendOrderIds[i]
            );
            removedOrderAmount += orderItem.amount;

            orderIds[i] = orderItem.orderId;
        }
    }

    function cleanBorrowOrders(address _user, uint256 _maturity)
        public
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
        ) = getActiveBorrowOrderIds(_user);

        Storage.slot().activeBorrowOrderIds[_user] = activeBorrowOrderIds;
        activeOrderCount = activeBorrowOrderIds.length;
        uint256 inactiveOrderCount = inActiveBorrowOrderIds.length;
        orderIds = new uint48[](inactiveOrderCount);

        for (uint256 i = 0; i < inactiveOrderCount; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveBorrowOrderIds[i]];
            OrderItem memory orderItem = Storage.slot().borrowOrders[_maturity].getOrderById(
                marketOrder.unitPrice,
                inActiveBorrowOrderIds[i]
            );
            removedFutureValue += Storage.slot().borrowOrders[_maturity].getFutureValue(
                marketOrder.unitPrice,
                inActiveBorrowOrderIds[i]
            );

            removedOrderAmount += orderItem.amount;

            orderIds[i] = orderItem.orderId;
        }
    }

    function removeOrder(address _user, uint48 _orderId)
        public
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
            removeOrderIdFromOrders(Storage.slot().activeLendOrderIds[_user], _orderId);
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            removedAmount = Storage.slot().borrowOrders[Storage.slot().maturity].removeOrder(
                marketOrder.unitPrice,
                _orderId
            );
            removeOrderIdFromOrders(Storage.slot().activeBorrowOrderIds[_user], _orderId);
        }

        return (marketOrder.side, removedAmount, marketOrder.unitPrice);
    }

    /**
     * @notice Increases and returns id of last order in order book.
     * @return The new order id
     */
    function nextOrderId() private returns (uint48) {
        Storage.slot().lastOrderId++;
        return Storage.slot().lastOrderId;
    }

    function removeOrderIdFromOrders(uint48[] storage orders, uint256 orderId) private {
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
}
