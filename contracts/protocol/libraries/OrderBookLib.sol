// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Constants} from "./Constants.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {OrderStatisticsTreeLib, PartiallyRemovedOrder} from "./OrderStatisticsTreeLib.sol";
import {RoundingUint256} from "./math/RoundingUint256.sol";

struct PlacedOrder {
    ProtocolTypes.Side side;
    uint256 unitPrice;
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

    uint256 public constant PRE_ORDER_BASE_PERIOD = 7 days;
    uint256 public constant ITAYOSE_PERIOD = 1 hours;

    error EmptyOrderBook();
    error PastMaturityOrderExists();

    struct OrderBook {
        uint256 maturity;
        uint256 openingDate;
        uint256 preOpeningDate;
        uint48 lastOrderId;
        uint48 lastOrderBlockNumber;
        bool isReliableBlock;
        // Micro slots for block unit price history
        uint80 blockUnitPriceHistory;
        uint256 blockTotalAmount;
        uint256 blockTotalFutureValue;
        // Mapping from user to active lend order ids
        mapping(address => uint48[]) activeLendOrderIds;
        // Mapping from user to active borrow order ids
        mapping(address => uint48[]) activeBorrowOrderIds;
        // Mapping from user to current maturity
        mapping(address => uint256) userCurrentMaturities;
        // Mapping from orderId to order micro slots
        mapping(uint256 => uint256) orders;
        // Mapping from orderId to boolean for pre-order or not
        mapping(uint256 => bool) isPreOrder;
        // Mapping from maturity to lending orders
        mapping(uint256 => OrderStatisticsTreeLib.Tree) lendOrders;
        // Mapping from maturity to borrowing orders
        mapping(uint256 => OrderStatisticsTreeLib.Tree) borrowOrders;
    }

    function initialize(
        OrderBook storage self,
        uint256 _maturity,
        uint256 _openingDate,
        uint256 _preOpeningDate
    ) internal returns (bool isReady) {
        self.maturity = _maturity;
        self.openingDate = _openingDate;
        self.preOpeningDate = _preOpeningDate;

        self.lastOrderBlockNumber = 0;
        self.blockTotalAmount = 0;
        self.blockTotalFutureValue = 0;
        self.blockUnitPriceHistory = 0;
        self.isReliableBlock = false;

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

    function getOrder(OrderBook storage self, uint256 _orderId)
        internal
        view
        returns (PlacedOrder memory order)
    {
        (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            uint256 timestamp
        ) = _unpackOrder(self.orders[_orderId]);
        order = PlacedOrder(side, unitPrice, maturity, timestamp);
    }

    function getMarketUnitPrice(OrderBook storage self) internal view returns (uint256 unitPrice) {
        unitPrice = _unpackBlockUnitPriceHistory(self.blockUnitPriceHistory)[0];

        // NOTE: If an order is in the first block of the order book, the block unit price history is empty.
        // In this case, the market unit price is calculated from the current block total amount and total future value
        // to avoid unwinding or liquidation the order in the same block using 0 as the market unit price.
        if ((self.lastOrderBlockNumber != block.number || unitPrice == 0) && self.isReliableBlock) {
            unitPrice = (self.blockTotalAmount * Constants.PRICE_DIGIT).div(
                self.blockTotalFutureValue
            );
        }
    }

    function getBlockUnitPriceAverage(OrderBook storage self, uint256 _maxCount)
        internal
        view
        returns (uint256 unitPrice)
    {
        uint256[] memory unitPrices = _unpackBlockUnitPriceHistory(self.blockUnitPriceHistory);
        uint256 length = unitPrices.length;
        uint256 sum;
        uint256 count;

        if (self.lastOrderBlockNumber != block.number && self.isReliableBlock) {
            sum = (self.blockTotalAmount * Constants.PRICE_DIGIT).div(self.blockTotalFutureValue);
            count = 1;
            _maxCount--;
        }

        for (uint256 i; i < _maxCount; i++) {
            if (i >= length || unitPrices[i] == 0) {
                break;
            }

            sum += unitPrices[i];
            count++;
        }

        unitPrice = count > 0 ? sum.div(count) : 0;
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
        uint256 userMaturity = self.userCurrentMaturities[_user];
        bool isPastMaturity = userMaturity != self.maturity;

        uint48[] memory orderIds = self.activeLendOrderIds[_user];
        uint256 orderIdLength = orderIds.length;
        activeOrderIds = new uint48[](isPastMaturity ? 0 : orderIdLength);
        inActiveOrderIds = new uint48[](orderIdLength);

        for (uint256 i; i < orderIdLength; i++) {
            uint48 orderId = orderIds[i];
            (, uint256 unitPrice, , ) = _unpackOrder(self.orders[orderId]);

            if (!self.lendOrders[userMaturity].isActiveOrderId(unitPrice, orderId)) {
                unchecked {
                    inActiveOrderCount += 1;
                }
                inActiveOrderIds[i - activeOrderCount] = orderId;
                if (!isPastMaturity) {
                    assembly {
                        mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                    }
                }
            } else {
                if (!isPastMaturity) {
                    unchecked {
                        activeOrderCount += 1;
                    }
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
        uint256 userMaturity = self.userCurrentMaturities[_user];
        bool isPastMaturity = userMaturity != self.maturity;

        uint48[] memory orderIds = self.activeBorrowOrderIds[_user];
        uint256 orderIdLength = orderIds.length;
        activeOrderIds = new uint48[](isPastMaturity ? 0 : orderIdLength);
        inActiveOrderIds = new uint48[](orderIdLength);

        for (uint256 i; i < orderIdLength; i++) {
            uint48 orderId = orderIds[i];
            (, uint256 unitPrice, , ) = _unpackOrder(self.orders[orderId]);

            if (!self.borrowOrders[userMaturity].isActiveOrderId(unitPrice, orderId)) {
                unchecked {
                    inActiveOrderCount += 1;
                }
                inActiveOrderIds[i - activeOrderCount] = orderId;
                if (!isPastMaturity) {
                    assembly {
                        mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                    }
                }
            } else {
                unchecked {
                    activeOrderCount += 1;
                }
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

        if (userMaturity != orderBookMaturity) {
            if (
                self.activeLendOrderIds[_user].length > 0 ||
                self.activeBorrowOrderIds[_user].length > 0
            ) {
                revert PastMaturityOrderExists();
            }

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
        self.orders[orderId] = _packOrder(_side, _unitPrice, self.maturity, block.timestamp);

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

    function setInitialBlockUnitPrice(OrderBook storage self, uint256 _unitPrice) internal {
        self.blockUnitPriceHistory = uint16(_unitPrice);
        self.lastOrderBlockNumber = uint48(block.number);
    }

    function updateBlockUnitPriceHistory(
        OrderBook storage self,
        uint256 _filledAmount,
        uint256 _filledFutureValue,
        uint256 _minimumReliableAmount
    ) internal {
        uint256 latestBlockUnitPrice = _unpackBlockUnitPriceHistory(self.blockUnitPriceHistory)[0];

        if (self.lastOrderBlockNumber != block.number) {
            if (self.isReliableBlock) {
                latestBlockUnitPrice = (self.blockTotalAmount * Constants.PRICE_DIGIT).div(
                    self.blockTotalFutureValue
                );

                // Remove the oldest block unit price and add the latest block unit price
                self.blockUnitPriceHistory =
                    uint16(latestBlockUnitPrice) |
                    (self.blockUnitPriceHistory << 16);
            }

            self.lastOrderBlockNumber = uint48(block.number);
            self.blockTotalAmount = _filledAmount;
            self.blockTotalFutureValue = _filledFutureValue;
            self.isReliableBlock = false;
        } else {
            self.blockTotalAmount += _filledAmount;
            self.blockTotalFutureValue += _filledFutureValue;
        }

        if (
            self.blockTotalAmount >= _minimumReliableAmount ||
            (self.blockTotalAmount > 0 && latestBlockUnitPrice == 0)
        ) {
            self.isReliableBlock = true;
        }
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
        (ProtocolTypes.Side side, uint256 unitPrice, , ) = _unpackOrder(self.orders[_orderId]);
        uint256 removedAmount;

        if (side == ProtocolTypes.Side.LEND) {
            removedAmount = self.lendOrders[self.maturity].removeOrder(unitPrice, _orderId);
            _removeOrderIdFromOrders(self.activeLendOrderIds[_user], _orderId);
        } else if (side == ProtocolTypes.Side.BORROW) {
            removedAmount = self.borrowOrders[self.maturity].removeOrder(unitPrice, _orderId);
            _removeOrderIdFromOrders(self.activeBorrowOrderIds[_user], _orderId);
        }

        delete self.orders[_orderId];

        return (side, removedAmount, unitPrice);
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
            bool orderExists
        )
    {
        bool isLend = _side == ProtocolTypes.Side.LEND;
        uint256 cbThresholdUnitPrice;
        uint256 bestUnitPrice;

        if (isLend) {
            bestUnitPrice = self.borrowOrders[self.maturity].first();
            cbThresholdUnitPrice = getLendCircuitBreakerThreshold(self, _circuitBreakerLimitRange);
        } else {
            bestUnitPrice = self.lendOrders[self.maturity].last();
            cbThresholdUnitPrice = getBorrowCircuitBreakerThreshold(
                self,
                _circuitBreakerLimitRange
            );
        }

        orderExists = bestUnitPrice != 0;

        if (
            _unitPrice == 0 ||
            (orderExists &&
                cbThresholdUnitPrice != 0 &&
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

    function getLendCircuitBreakerThreshold(
        OrderBook storage self,
        uint256 _circuitBreakerLimitRange
    ) internal view returns (uint256 cbThresholdUnitPrice) {
        uint256 blockUnitPriceAverage = getBlockUnitPriceAverage(self, 3);
        cbThresholdUnitPrice = (blockUnitPriceAverage *
            (Constants.PCT_DIGIT + _circuitBreakerLimitRange * 2)).div(Constants.PCT_DIGIT);

        if (cbThresholdUnitPrice > Constants.PRICE_DIGIT || blockUnitPriceAverage == 0) {
            cbThresholdUnitPrice = Constants.PRICE_DIGIT;
        } else if (
            cbThresholdUnitPrice < blockUnitPriceAverage + Constants.MINIMUM_CIRCUIT_BREAKER_RANGE
        ) {
            cbThresholdUnitPrice = blockUnitPriceAverage + Constants.MINIMUM_CIRCUIT_BREAKER_RANGE;
        }
    }

    function getBorrowCircuitBreakerThreshold(
        OrderBook storage self,
        uint256 _circuitBreakerLimitRange
    ) internal view returns (uint256 cbThresholdUnitPrice) {
        uint256 blockUnitPriceAverage = getBlockUnitPriceAverage(self, 5);
        cbThresholdUnitPrice = (blockUnitPriceAverage *
            (Constants.PCT_DIGIT - _circuitBreakerLimitRange)).div(Constants.PCT_DIGIT);

        if (
            cbThresholdUnitPrice == 0 ||
            blockUnitPriceAverage == 0 ||
            blockUnitPriceAverage <= Constants.MINIMUM_CIRCUIT_BREAKER_RANGE
        ) {
            cbThresholdUnitPrice = 1;
        } else if (
            blockUnitPriceAverage < cbThresholdUnitPrice + Constants.MINIMUM_CIRCUIT_BREAKER_RANGE
        ) {
            cbThresholdUnitPrice = blockUnitPriceAverage - Constants.MINIMUM_CIRCUIT_BREAKER_RANGE;
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

    /**
     * @notice Packs order parameters into uint256
     */
    function _packOrder(
        ProtocolTypes.Side _side,
        uint256 _unitPrice,
        uint256 _maturity,
        uint256 _timestamp
    ) private pure returns (uint256) {
        return uint256(_side) | (_unitPrice << 8) | (_maturity << 24) | (_timestamp << 88);
    }

    /**
     * @notice Unpacks order parameters from uint256
     */
    function _unpackOrder(uint256 _order)
        private
        pure
        returns (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            uint256 timestamp
        )
    {
        side = ProtocolTypes.Side(uint8(_order));
        unitPrice = uint16(_order >> 8);
        maturity = uint64(_order >> 24);
        timestamp = uint64(_order >> 88);
    }

    function _unpackBlockUnitPriceHistory(uint80 _blockUnitPriceHistory)
        private
        pure
        returns (uint256[] memory prices)
    {
        prices = new uint256[](5);

        prices[0] = uint16(_blockUnitPriceHistory);
        prices[1] = uint16(_blockUnitPriceHistory >> 16);
        prices[2] = uint16(_blockUnitPriceHistory >> 32);
        prices[3] = uint16(_blockUnitPriceHistory >> 48);
        prices[4] = uint16(_blockUnitPriceHistory >> 64);
    }
}
