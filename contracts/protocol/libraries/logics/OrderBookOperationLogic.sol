// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Constants} from "../Constants.sol";
import {OrderBookLib, FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, ItayoseLog} from "../../storages/LendingMarketStorage.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";

library OrderBookOperationLogic {
    using OrderBookLib for OrderBookLib.OrderBook;
    using RoundingUint256 for uint256;

    event OrderBookCreated(uint8 orderBookId, uint256 maturity, uint256 openingDate);
    event OrderBooksRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);

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

    function getCircuitBreakerThresholds(uint8 _orderBookId, uint256 _circuitBreakerLimitRange)
        external
        view
        returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
    {
        return _getOrderBook(_orderBookId).getCircuitBreakerThresholds(_circuitBreakerLimitRange);
    }

    function getBestLendUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        return _getOrderBook(_orderBookId).getBestLendUnitPrice();
    }

    function getBestLendUnitPrices() external view returns (uint256[] memory unitPrices) {
        uint8[] memory orderBookIds = Storage.slot().orderBookIds;
        unitPrices = new uint256[](orderBookIds.length);

        for (uint256 i; i < orderBookIds.length; i++) {
            unitPrices[i] = _getOrderBook(orderBookIds[i]).getBestLendUnitPrice();
        }
    }

    function getBestBorrowUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        return _getOrderBook(_orderBookId).getBestBorrowUnitPrice();
    }

    function getBestBorrowUnitPrices() external view returns (uint256[] memory unitPrices) {
        uint8[] memory orderBookIds = Storage.slot().orderBookIds;
        unitPrices = new uint256[](orderBookIds.length);

        for (uint256 i; i < orderBookIds.length; i++) {
            unitPrices[i] = _getOrderBook(orderBookIds[i]).getBestBorrowUnitPrice();
        }
    }

    function getMidUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        uint256 borrowUnitPrice = orderBook.getBestLendUnitPrice();
        uint256 lendUnitPrice = orderBook.getBestBorrowUnitPrice();
        return (borrowUnitPrice + lendUnitPrice).div(2);
    }

    function getMidUnitPrices() external view returns (uint256[] memory unitPrices) {
        uint8[] memory orderBookIds = Storage.slot().orderBookIds;
        unitPrices = new uint256[](orderBookIds.length);

        for (uint256 i; i < orderBookIds.length; i++) {
            unitPrices[i] = getMidUnitPrice(orderBookIds[i]);
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

    function getMaturities() public view returns (uint256[] memory maturities) {
        uint8[] memory orderBookIds = Storage.slot().orderBookIds;
        maturities = new uint256[](orderBookIds.length);

        for (uint256 i; i < orderBookIds.length; i++) {
            maturities[i] = _getOrderBook(orderBookIds[i]).maturity;
        }
    }

    function createOrderBook(uint256 _maturity, uint256 _openingDate)
        public
        returns (uint8 orderBookId)
    {
        orderBookId = _nextOrderBookId();
        Storage.slot().orderBookIds.push(orderBookId);

        Storage.slot().isReady[_maturity] = _getOrderBook(orderBookId).initialize(
            _maturity,
            _openingDate
        );

        emit OrderBookCreated(orderBookId, _maturity, _openingDate);
    }

    function rotateOrderBooks(uint256 _newMaturity) external returns (uint8, uint8) {
        uint8[] storage orderBookIds = Storage.slot().orderBookIds;

        require(orderBookIds.length >= 2, "Not enough order books");

        uint8 currentOrderBookId = orderBookIds[0];

        // The market that is moved to the last of the list opens again when the next market is matured.
        // Just before the opening, the moved market needs the Itayose execution.
        uint256 nearestMaturity = Storage.slot().orderBooks[orderBookIds[1]].maturity;

        OrderBookLib.OrderBook storage orderBook = Storage.slot().orderBooks[currentOrderBookId];
        uint256 maturedMaturity = orderBook.maturity;

        require(orderBook.isMatured(), "Market is not matured");

        Storage.slot().isReady[_newMaturity] = orderBook.initialize(_newMaturity, nearestMaturity);

        // Rotate the order of the market
        for (uint256 i = 0; i < orderBookIds.length; i++) {
            uint8 orderBookId = (orderBookIds.length - 1) == i
                ? currentOrderBookId
                : orderBookIds[i + 1];
            orderBookIds[i] = orderBookId;
        }

        emit OrderBooksRotated(Storage.slot().ccy, maturedMaturity, _newMaturity);

        return (orderBookIds[0], orderBookIds[1]);
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
