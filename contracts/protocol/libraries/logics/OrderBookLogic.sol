// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Constants} from "../Constants.sol";
import {OrderBookLib, FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, ItayoseLog} from "../../storages/LendingMarketStorage.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";

library OrderBookLogic {
    using OrderBookLib for OrderBookLib.OrderBook;
    using RoundingUint256 for uint256;

    event OrderFeeRateUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event CircuitBreakerLimitRangeUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event OrderBookCreated(uint8 orderBookId, uint256 maturity, uint256 openingDate);

    event ItayoseExecuted(
        bytes32 ccy,
        uint256 maturity,
        uint256 openingUnitPrice,
        uint256 lastLendUnitPrice,
        uint256 lastBorrowUnitPrice,
        uint256 offsetAmount
    );

    function getOrderBookDetail(uint8 _orderBookId)
        public
        view
        returns (
            bytes32 ccy,
            uint256 maturity,
            uint256 openingDate,
            uint256 borrowUnitPrice,
            uint256 lendUnitPrice,
            uint256 midUnitPrice,
            uint256 openingUnitPrice,
            bool isReady
        )
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);

        ccy = Storage.slot().ccy;
        maturity = orderBook.maturity;
        openingDate = orderBook.openingDate;
        borrowUnitPrice = orderBook.getBestLendUnitPrice();
        lendUnitPrice = orderBook.getBestBorrowUnitPrice();
        midUnitPrice = getMidUnitPrice(_orderBookId);
        openingUnitPrice = Storage.slot().itayoseLogs[orderBook.maturity].openingUnitPrice;
        isReady = Storage.slot().isReady[maturity];
    }

    function getCircuitBreakerThresholds(uint8 _orderBookId)
        external
        view
        returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
    {
        return
            _getOrderBook(_orderBookId).getCircuitBreakerThresholds(
                Storage.slot().circuitBreakerLimitRange
            );
    }

    function getBestLendUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        return _getOrderBook(_orderBookId).getBestLendUnitPrice();
    }

    function getBestLendUnitPrices(uint8[] memory _orderBookIds)
        external
        view
        returns (uint256[] memory unitPrices)
    {
        unitPrices = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            unitPrices[i] = _getOrderBook(_orderBookIds[i]).getBestLendUnitPrice();
        }
    }

    function getBestBorrowUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        return _getOrderBook(_orderBookId).getBestBorrowUnitPrice();
    }

    function getBestBorrowUnitPrices(uint8[] memory _orderBookIds)
        external
        view
        returns (uint256[] memory unitPrices)
    {
        unitPrices = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            unitPrices[i] = _getOrderBook(_orderBookIds[i]).getBestBorrowUnitPrice();
        }
    }

    function getMidUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        uint256 borrowUnitPrice = orderBook.getBestLendUnitPrice();
        uint256 lendUnitPrice = orderBook.getBestBorrowUnitPrice();
        return (borrowUnitPrice + lendUnitPrice).div(2);
    }

    function getMidUnitPrices(uint8[] memory _orderBookIds)
        external
        view
        returns (uint256[] memory unitPrices)
    {
        unitPrices = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            unitPrices[i] = getMidUnitPrice(_orderBookIds[i]);
        }
    }

    function getBorrowOrderBook(uint8 _orderBookId, uint256 _limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        return _getOrderBook(_orderBookId).getBorrowOrderBook(_limit);
    }

    function getLendOrderBook(uint8 _orderBookId, uint256 _limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        return _getOrderBook(_orderBookId).getLendOrderBook(_limit);
    }

    function getMaturities(uint8[] memory _orderBookIds)
        public
        view
        returns (uint256[] memory maturities)
    {
        maturities = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            maturities[i] = _getOrderBook(_orderBookIds[i]).maturity;
        }
    }

    function updateOrderFeeRate(uint256 _orderFeeRate) external {
        require(_orderFeeRate <= Constants.PCT_DIGIT, "Invalid order fee rate");
        uint256 previousRate = Storage.slot().orderFeeRate;

        if (_orderFeeRate != previousRate) {
            Storage.slot().orderFeeRate = _orderFeeRate;

            emit OrderFeeRateUpdated(Storage.slot().ccy, previousRate, _orderFeeRate);
        }
    }

    function updateCircuitBreakerLimitRange(uint256 _cbLimitRange) external {
        require(_cbLimitRange <= Constants.PCT_DIGIT, "Invalid circuit breaker limit range");
        uint256 previousRange = Storage.slot().circuitBreakerLimitRange;

        if (_cbLimitRange != previousRange) {
            Storage.slot().circuitBreakerLimitRange = _cbLimitRange;

            emit CircuitBreakerLimitRangeUpdated(Storage.slot().ccy, previousRange, _cbLimitRange);
        }
    }

    function createOrderBook(uint256 _maturity, uint256 _openingDate)
        public
        returns (uint8 orderBookId)
    {
        orderBookId = _nextOrderBookId();

        Storage.slot().isReady[_maturity] = _getOrderBook(orderBookId).initialize(
            _maturity,
            _openingDate
        );

        emit OrderBookCreated(orderBookId, _maturity, _openingDate);
    }

    function reopenOrderBook(
        uint8 _orderBookId,
        uint256 _newMaturity,
        uint256 _openingDate
    ) external {
        OrderBookLib.OrderBook storage orderBook = Storage.slot().orderBooks[_orderBookId];
        require(orderBook.isMatured(), "Market is not matured");
        Storage.slot().isReady[_newMaturity] = orderBook.initialize(_newMaturity, _openingDate);
    }

    function executeItayoseCall(uint8 _orderBookId)
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        )
    {
        uint256 lastLendUnitPrice;
        uint256 lastBorrowUnitPrice;
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);

        (openingUnitPrice, lastLendUnitPrice, lastBorrowUnitPrice, totalOffsetAmount) = orderBook
            .getOpeningUnitPrice();

        if (totalOffsetAmount > 0) {
            ProtocolTypes.Side[2] memory sides = [
                ProtocolTypes.Side.LEND,
                ProtocolTypes.Side.BORROW
            ];

            for (uint256 i; i < sides.length; i++) {
                ProtocolTypes.Side partiallyFilledOrderSide;
                PartiallyFilledOrder memory partiallyFilledOrder;
                (, partiallyFilledOrder, , ) = orderBook.fillOrders(
                    sides[i],
                    totalOffsetAmount,
                    0,
                    0
                );

                if (partiallyFilledOrder.futureValue > 0) {
                    if (sides[i] == ProtocolTypes.Side.LEND) {
                        partiallyFilledOrderSide = ProtocolTypes.Side.BORROW;
                        partiallyFilledBorrowingOrder = partiallyFilledOrder;
                    } else {
                        partiallyFilledOrderSide = ProtocolTypes.Side.LEND;
                        partiallyFilledLendingOrder = partiallyFilledOrder;
                    }
                }
            }

            emit ItayoseExecuted(
                Storage.slot().ccy,
                orderBook.maturity,
                openingUnitPrice,
                lastLendUnitPrice,
                lastBorrowUnitPrice,
                totalOffsetAmount
            );
        }

        Storage.slot().isReady[orderBook.maturity] = true;
        Storage.slot().itayoseLogs[orderBook.maturity] = ItayoseLog(
            openingUnitPrice,
            lastLendUnitPrice,
            lastBorrowUnitPrice
        );
        openingDate = orderBook.openingDate;
    }

    function _nextOrderBookId() internal returns (uint8) {
        Storage.slot().lastOrderBookId++;
        return Storage.slot().lastOrderBookId;
    }

    function _getOrderBook(uint8 _orderBookId)
        private
        view
        returns (OrderBookLib.OrderBook storage)
    {
        return Storage.slot().orderBooks[_orderBookId];
    }
}
