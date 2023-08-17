// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Constants} from "./Constants.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {OrderStatisticsTreeLib, PartiallyRemovedOrder, OrderItem} from "./OrderStatisticsTreeLib.sol";
import {RoundingUint256} from "./math/RoundingUint256.sol";

struct PlacedOrder {
    ProtocolTypes.Side side;
    uint256 unitPrice; // in basis points
    uint256 maturity;
    uint256 timestamp;
}

struct FilledOrder {
    uint256 amount;
    uint256 unitPrice;
    uint256 futureValue;
    uint256 ignoredAmount;
}

struct PartiallyFilledOrder {
    uint48 orderId;
    address maker;
    uint256 amount;
    uint256 futureValue;
}

library OrderBookLib {
    using OrderStatisticsTreeLib for OrderStatisticsTreeLib.Tree;
    using RoundingUint256 for uint256;

    uint256 private constant PRE_ORDER_PERIOD = 7 days;
    uint256 private constant ITAYOSE_PERIOD = 1 hours;

    struct OrderBook {
        uint48 lastOrderId;
        uint256 openingDate;
        uint256 maturity;
        // Mapping from user to active lend order ids
        mapping(address => uint48[]) activeLendOrderIds;
        // Mapping from user to active borrow order ids
        mapping(address => uint48[]) activeBorrowOrderIds;
        // Mapping from user to current maturity
        mapping(address => uint256) userCurrentMaturities;
        // Mapping from orderId to order
        mapping(uint256 => PlacedOrder) orders;
        // Mapping from orderId to boolean for pre-order or not
        mapping(uint256 => bool) isPreOrder;
        // Mapping from maturity to lending orders
        mapping(uint256 => OrderStatisticsTreeLib.Tree) lendOrders;
        // Mapping from maturity to borrowing orders
        mapping(uint256 => OrderStatisticsTreeLib.Tree) borrowOrders;
        // Mapping from order side to threshold unit price of circuit breaker per block
        mapping(uint256 => mapping(ProtocolTypes.Side => uint256)) circuitBreakerThresholdUnitPrices;
    }

    function initialize(
        OrderBook storage self,
        uint256 _maturity,
        uint256 _openingDate
    ) internal returns (bool isReady) {
        self.maturity = _maturity;
        self.openingDate = _openingDate;

        if (block.timestamp >= (_openingDate - ITAYOSE_PERIOD)) {
            isReady = true;
        }
    }

    function isMatured(OrderBook storage self) internal view returns (bool) {
        return block.timestamp >= self.maturity;
    }

    function getBestBorrowUnitPrice(OrderBook storage self) internal view returns (uint256) {
        return self.lendOrders[self.maturity].last();
    }

    function getBestLendUnitPrice(OrderBook storage self) internal view returns (uint256) {
        uint256 unitPrice = self.borrowOrders[self.maturity].first();
        return unitPrice == 0 ? Constants.PRICE_DIGIT : unitPrice;
    }

    function hasBorrowOrder(OrderBook storage self, address _user) internal view returns (bool) {
        return self.activeBorrowOrderIds[_user].length != 0;
    }

    function hasLendOrder(OrderBook storage self, address _user) internal view returns (bool) {
        return self.activeLendOrderIds[_user].length != 0;
    }

    function getLendOrderBook(OrderBook storage self, uint256 _limit)
        internal
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

        uint256 unitPrice = self.lendOrders[self.maturity].last();
        unitPrices[0] = unitPrice;
        amounts[0] = self.lendOrders[self.maturity].getNodeTotalAmount(unitPrice);
        quantities[0] = self.lendOrders[self.maturity].getNodeCount(unitPrice);

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = self.lendOrders[self.maturity].prev(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = self.lendOrders[self.maturity].getNodeTotalAmount(unitPrice);
            quantities[i] = self.lendOrders[self.maturity].getNodeCount(unitPrice);
        }
    }

    function getBorrowOrderBook(OrderBook storage self, uint256 _limit)
        internal
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

        uint256 unitPrice = self.borrowOrders[self.maturity].first();
        unitPrices[0] = unitPrice;
        amounts[0] = self.borrowOrders[self.maturity].getNodeTotalAmount(unitPrice);
        quantities[0] = self.borrowOrders[self.maturity].getNodeCount(unitPrice);

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = self.borrowOrders[self.maturity].next(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = self.borrowOrders[self.maturity].getNodeTotalAmount(unitPrice);
            quantities[i] = self.borrowOrders[self.maturity].getNodeCount(unitPrice);
        }
    }

    function getLendOrderIds(OrderBook storage self, address _user)
        internal
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        uint256 activeOrderCount = 0;
        uint256 inActiveOrderCount = 0;
        bool isPastMaturity = self.userCurrentMaturities[_user] != self.maturity;

        activeOrderIds = new uint48[](isPastMaturity ? 0 : self.activeLendOrderIds[_user].length);
        inActiveOrderIds = new uint48[](self.activeLendOrderIds[_user].length);

        for (uint256 i; i < self.activeLendOrderIds[_user].length; i++) {
            uint48 orderId = self.activeLendOrderIds[_user][i];
            PlacedOrder memory order = self.orders[orderId];

            if (
                !self.lendOrders[self.userCurrentMaturities[_user]].isActiveOrderId(
                    order.unitPrice,
                    orderId
                )
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

    function getBorrowOrderIds(OrderBook storage self, address _user)
        internal
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        uint256 activeOrderCount = 0;
        uint256 inActiveOrderCount = 0;
        bool isPastMaturity = self.userCurrentMaturities[_user] != self.maturity;

        activeOrderIds = new uint48[](isPastMaturity ? 0 : self.activeBorrowOrderIds[_user].length);
        inActiveOrderIds = new uint48[](self.activeBorrowOrderIds[_user].length);

        for (uint256 i; i < self.activeBorrowOrderIds[_user].length; i++) {
            uint48 orderId = self.activeBorrowOrderIds[_user][i];
            PlacedOrder memory order = self.orders[orderId];

            if (
                !self.borrowOrders[self.userCurrentMaturities[_user]].isActiveOrderId(
                    order.unitPrice,
                    orderId
                )
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

    function calculateFilledAmount(
        OrderBook storage self,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        internal
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV
        )
    {
        if (_amount == 0) return (0, 0, 0);

        if (_side == ProtocolTypes.Side.LEND) {
            return
                self.borrowOrders[self.maturity].calculateDroppedAmountFromLeft(
                    _amount,
                    0,
                    _unitPrice
                );
        } else {
            return
                self.lendOrders[self.maturity].calculateDroppedAmountFromRight(
                    _amount,
                    0,
                    _unitPrice
                );
        }
    }

    function updateUserMaturity(OrderBook storage self, address _user) internal {
        uint256 userMaturity = self.userCurrentMaturities[_user];
        uint256 orderBookMaturity = self.maturity;

        require(
            userMaturity == orderBookMaturity ||
                (userMaturity != orderBookMaturity &&
                    self.activeLendOrderIds[_user].length == 0 &&
                    self.activeBorrowOrderIds[_user].length == 0),
            "Order found in past maturity"
        );

        if (userMaturity != orderBookMaturity) {
            self.userCurrentMaturities[_user] = orderBookMaturity;
        }
    }

    function placeOrder(
        OrderBook storage self,
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    ) internal returns (uint48 orderId) {
        orderId = _nextOrderId(self);
        self.orders[orderId] = PlacedOrder(_side, _unitPrice, self.maturity, block.timestamp);

        if (_side == ProtocolTypes.Side.LEND) {
            self.lendOrders[self.maturity].insertOrder(_unitPrice, orderId, _user, _amount);
            self.activeLendOrderIds[_user].push(orderId);
        } else if (_side == ProtocolTypes.Side.BORROW) {
            self.borrowOrders[self.maturity].insertOrder(_unitPrice, orderId, _user, _amount);
            self.activeBorrowOrderIds[_user].push(orderId);
        }
    }

    function fillOrders(
        OrderBook storage self,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _amountInFV,
        uint256 _unitPrice
    )
        internal
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 remainingAmount,
            bool orderExists
        )
    {
        PartiallyRemovedOrder memory partiallyRemovedOrder;

        if (_side == ProtocolTypes.Side.BORROW) {
            OrderStatisticsTreeLib.Tree storage orders = self.lendOrders[self.maturity];
            (
                filledOrder.unitPrice,
                filledOrder.amount,
                filledOrder.futureValue,
                remainingAmount,
                partiallyRemovedOrder
            ) = orders.dropRight(_amount, _amountInFV, _unitPrice);
            orderExists = orders.hasOrders();
        } else if (_side == ProtocolTypes.Side.LEND) {
            OrderStatisticsTreeLib.Tree storage orders = self.borrowOrders[self.maturity];
            (
                filledOrder.unitPrice,
                filledOrder.amount,
                filledOrder.futureValue,
                remainingAmount,
                partiallyRemovedOrder
            ) = orders.dropLeft(_amount, _amountInFV, _unitPrice);
            orderExists = orders.hasOrders();
        }

        partiallyFilledOrder = PartiallyFilledOrder(
            partiallyRemovedOrder.orderId,
            partiallyRemovedOrder.maker,
            partiallyRemovedOrder.amount,
            partiallyRemovedOrder.futureValue
        );
    }

    function removeOrder(
        OrderBook storage self,
        address _user,
        uint48 _orderId
    )
        internal
        returns (
            ProtocolTypes.Side,
            uint256,
            uint256
        )
    {
        PlacedOrder memory order = self.orders[_orderId];
        uint256 removedAmount;
        if (order.side == ProtocolTypes.Side.LEND) {
            removedAmount = self.lendOrders[self.maturity].removeOrder(order.unitPrice, _orderId);
            _removeOrderIdFromOrders(self.activeLendOrderIds[_user], _orderId);
        } else if (order.side == ProtocolTypes.Side.BORROW) {
            removedAmount = self.borrowOrders[self.maturity].removeOrder(order.unitPrice, _orderId);
            _removeOrderIdFromOrders(self.activeBorrowOrderIds[_user], _orderId);
        }

        return (order.side, removedAmount, order.unitPrice);
    }

    function getOpeningUnitPrice(OrderBook storage self)
        internal
        view
        returns (
            uint256 openingUnitPrice,
            uint256 lastLendUnitPrice,
            uint256 lastBorrowUnitPrice,
            uint256 totalOffsetAmount
        )
    {
        uint256 lendUnitPrice = getBestBorrowUnitPrice(self);
        uint256 borrowUnitPrice = getBestLendUnitPrice(self);
        uint256 lendAmount = self.lendOrders[self.maturity].getNodeTotalAmount(lendUnitPrice);
        uint256 borrowAmount = self.borrowOrders[self.maturity].getNodeTotalAmount(borrowUnitPrice);

        OrderStatisticsTreeLib.Tree storage borrowOrders = self.borrowOrders[self.maturity];
        OrderStatisticsTreeLib.Tree storage lendOrders = self.lendOrders[self.maturity];

        // return mid price when no lending and borrowing orders overwrap
        if (borrowUnitPrice > lendUnitPrice) {
            openingUnitPrice = (lendUnitPrice + borrowUnitPrice).div(2);
            return (openingUnitPrice, 0, 0, 0);
        }

        while (borrowUnitPrice <= lendUnitPrice && borrowUnitPrice > 0 && lendUnitPrice > 0) {
            lastLendUnitPrice = lendUnitPrice;
            lastBorrowUnitPrice = borrowUnitPrice;

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

    function getAndUpdateOrderExecutionConditions(
        OrderBook storage self,
        ProtocolTypes.Side _side,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange
    )
        internal
        returns (
            bool isFilled,
            uint256 executedUnitPrice,
            bool ignoreRemainingAmount,
            bool orderExists
        )
    {
        uint256 cbThresholdUnitPrice;
        bool isFirstOrderInBlock;

        (
            isFilled,
            executedUnitPrice,
            ignoreRemainingAmount,
            orderExists,
            cbThresholdUnitPrice,
            isFirstOrderInBlock
        ) = getOrderExecutionConditions(self, _side, _unitPrice, _circuitBreakerLimitRange);

        if (isFirstOrderInBlock) {
            self.circuitBreakerThresholdUnitPrices[block.number][_side] = cbThresholdUnitPrice;
        }
    }

    function getOrderExecutionConditions(
        OrderBook storage self,
        ProtocolTypes.Side _side,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange
    )
        internal
        view
        returns (
            bool isFilled,
            uint256 executedUnitPrice,
            bool ignoreRemainingAmount,
            bool orderExists,
            uint256 cbThresholdUnitPrice,
            bool isFirstOrderInBlock
        )
    {
        cbThresholdUnitPrice = self.circuitBreakerThresholdUnitPrices[block.number][_side];
        bool isLend = _side == ProtocolTypes.Side.LEND;
        uint256 bestUnitPrice;

        if (isLend) {
            bestUnitPrice = self.borrowOrders[self.maturity].first();
            orderExists = bestUnitPrice != 0;

            if (orderExists && cbThresholdUnitPrice == 0) {
                cbThresholdUnitPrice = _getLendCircuitBreakerThreshold(
                    _circuitBreakerLimitRange,
                    bestUnitPrice
                );
                isFirstOrderInBlock = true;
            }
        } else {
            bestUnitPrice = self.lendOrders[self.maturity].last();
            orderExists = bestUnitPrice != 0;

            if (orderExists && cbThresholdUnitPrice == 0) {
                cbThresholdUnitPrice = _getBorrowCircuitBreakerThreshold(
                    _circuitBreakerLimitRange,
                    bestUnitPrice
                );
                isFirstOrderInBlock = true;
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

        if (orderExists) {
            isFilled = isLend
                ? bestUnitPrice <= executedUnitPrice
                : bestUnitPrice >= executedUnitPrice;
        }
    }

    function getCircuitBreakerThresholds(OrderBook storage self, uint256 _circuitBreakerLimitRange)
        internal
        view
        returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
    {
        maxLendUnitPrice = _getLendCircuitBreakerThreshold(
            _circuitBreakerLimitRange,
            getBestLendUnitPrice(self)
        );
        minBorrowUnitPrice = _getBorrowCircuitBreakerThreshold(
            _circuitBreakerLimitRange,
            getBestBorrowUnitPrice(self)
        );
    }

    function _getBorrowCircuitBreakerThreshold(
        uint256 _circuitBreakerLimitRange,
        uint256 _unitPrice
    ) private pure returns (uint256 cbThresholdUnitPrice) {
        // NOTE: Formula of circuit breaker threshold for borrow orders:
        // cbThreshold = 100 / (1 + (100 / price - 1) * (1 + range))
        uint256 numerator = _unitPrice * Constants.PRICE_DIGIT * Constants.PCT_DIGIT;
        uint256 denominator = _unitPrice *
            Constants.PCT_DIGIT +
            (Constants.PRICE_DIGIT - _unitPrice) *
            (Constants.PCT_DIGIT + _circuitBreakerLimitRange);
        cbThresholdUnitPrice = numerator.div(denominator);

        if (_unitPrice > cbThresholdUnitPrice + Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD) {
            cbThresholdUnitPrice = _unitPrice - Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD;
        } else if (
            _unitPrice < cbThresholdUnitPrice + Constants.MINIMUM_CIRCUIT_BREAKER_THRESHOLD
        ) {
            cbThresholdUnitPrice = _unitPrice > Constants.MINIMUM_CIRCUIT_BREAKER_THRESHOLD
                ? _unitPrice - Constants.MINIMUM_CIRCUIT_BREAKER_THRESHOLD
                : 1;
        }
    }

    function _getLendCircuitBreakerThreshold(uint256 _circuitBreakerLimitRange, uint256 _unitPrice)
        private
        pure
        returns (uint256 cbThresholdUnitPrice)
    {
        // NOTE: Formula of circuit breaker threshold for lend orders:
        // cbThreshold = 100 / (1 + (100 / price - 1) * (1 - range))
        uint256 num = _unitPrice * Constants.PRICE_DIGIT * Constants.PCT_DIGIT;
        uint256 den = _unitPrice *
            Constants.PCT_DIGIT +
            (Constants.PRICE_DIGIT - _unitPrice) *
            (Constants.PCT_DIGIT - _circuitBreakerLimitRange);
        cbThresholdUnitPrice = num.div(den);

        if (cbThresholdUnitPrice > _unitPrice + Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD) {
            cbThresholdUnitPrice = _unitPrice + Constants.MAXIMUM_CIRCUIT_BREAKER_THRESHOLD;
        } else if (
            cbThresholdUnitPrice < _unitPrice + Constants.MINIMUM_CIRCUIT_BREAKER_THRESHOLD
        ) {
            cbThresholdUnitPrice = _unitPrice + Constants.MINIMUM_CIRCUIT_BREAKER_THRESHOLD <=
                Constants.PRICE_DIGIT
                ? _unitPrice + Constants.MINIMUM_CIRCUIT_BREAKER_THRESHOLD
                : Constants.PRICE_DIGIT;
        }
    }

    /**
     * @notice Increases and returns id of last order in order book.
     * @return The new order id
     */
    function _nextOrderId(OrderBook storage self) private returns (uint48) {
        self.lastOrderId++;
        return self.lastOrderId;
    }

    function _removeOrderIdFromOrders(uint48[] storage orders, uint256 orderId) private {
        uint256 lastOrderIndex = orders.length - 1;
        for (uint256 i; i <= lastOrderIndex; i++) {
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
