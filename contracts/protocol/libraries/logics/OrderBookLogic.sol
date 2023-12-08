// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Constants} from "../Constants.sol";
import {OrderBookLib, FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, ItayoseLog} from "../../storages/LendingMarketStorage.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";

library OrderBookLogic {
    using OrderBookLib for OrderBookLib.OrderBook;
    using RoundingUint256 for uint256;

    error InvalidOrderFeeRate();
    error InvalidCircuitBreakerLimitRange();
    error InvalidMaturity(uint256 maturity);
    error OrderBookNotMatured();

    event OrderFeeRateUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event CircuitBreakerLimitRangeUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event OrderBookCreated(uint256 maturity, uint256 openingDate);

    event ItayoseExecuted(
        bytes32 ccy,
        uint256 maturity,
        uint256 openingUnitPrice,
        uint256 lastLendUnitPrice,
        uint256 lastBorrowUnitPrice,
        uint256 offsetAmount
    );

    function isReady(uint256 _maturity) public view returns (bool) {
        return Storage.slot().isReady[_getOrderBook(_maturity).maturity];
    }

    function isMatured(uint256 _maturity) public view returns (bool) {
        return _getOrderBook(_maturity).isMatured();
    }

    function isOpened(uint256 _maturity) public view returns (bool) {
        return
            isReady(_maturity) &&
            !isMatured(_maturity) &&
            block.timestamp >= _getOrderBook(_maturity).openingDate;
    }

    function isItayosePeriod(uint256 _maturity) public view returns (bool) {
        return
            block.timestamp >=
            (_getOrderBook(_maturity).openingDate - OrderBookLib.ITAYOSE_PERIOD) &&
            !isReady(_maturity);
    }

    function isPreOrderPeriod(uint256 _maturity) public view returns (bool) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);
        return
            block.timestamp >= orderBook.preOpeningDate &&
            block.timestamp < (orderBook.openingDate - OrderBookLib.ITAYOSE_PERIOD);
    }

    function getOrderBookDetail(
        uint256 _maturity
    ) public view returns (bytes32 ccy, uint256 openingDate, uint256 preOpeningDate) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);

        ccy = Storage.slot().ccy;
        openingDate = orderBook.openingDate;
        preOpeningDate = orderBook.preOpeningDate;
    }

    function getLastOrderTimestamp(uint256 _maturity) external view returns (uint48) {
        return _getOrderBook(_maturity).lastOrderTimestamp;
    }

    function getBlockUnitPriceHistory(
        uint256 _maturity
    ) external view returns (uint256[] memory unitPrices, uint48 timestamp) {
        return _getOrderBook(_maturity).getBlockUnitPriceHistory(true);
    }

    function getMarketUnitPrice(uint256 _maturity) external view returns (uint256) {
        return _getOrderBook(_maturity).getMarketUnitPrice(true);
    }

    function getBlockUnitPriceAverage(
        uint256 _maturity,
        uint256 _count
    ) external view returns (uint256) {
        return _getOrderBook(_maturity).getBlockUnitPriceAverage(_count, true);
    }

    function getCircuitBreakerThresholds(
        uint256 _maturity
    ) external view returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice) {
        maxLendUnitPrice = _getOrderBook(_maturity).getLendCircuitBreakerThreshold(
            Storage.slot().circuitBreakerLimitRange,
            true
        );
        minBorrowUnitPrice = _getOrderBook(_maturity).getBorrowCircuitBreakerThreshold(
            Storage.slot().circuitBreakerLimitRange,
            true
        );
    }

    function getBestLendUnitPrice(uint256 _maturity) public view returns (uint256) {
        return _getOrderBook(_maturity).getBestLendUnitPrice();
    }

    function getBestLendUnitPrices(
        uint256[] memory _maturities
    ) external view returns (uint256[] memory unitPrices) {
        unitPrices = new uint256[](_maturities.length);

        for (uint256 i; i < _maturities.length; i++) {
            unitPrices[i] = _getOrderBook(_maturities[i]).getBestLendUnitPrice();
        }
    }

    function getBestBorrowUnitPrice(uint256 _maturity) public view returns (uint256) {
        return _getOrderBook(_maturity).getBestBorrowUnitPrice();
    }

    function getBestBorrowUnitPrices(
        uint256[] memory _maturities
    ) external view returns (uint256[] memory unitPrices) {
        unitPrices = new uint256[](_maturities.length);

        for (uint256 i; i < _maturities.length; i++) {
            unitPrices[i] = _getOrderBook(_maturities[i]).getBestBorrowUnitPrice();
        }
    }

    function getBorrowOrderBook(
        uint256 _maturity,
        uint256 _start,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        )
    {
        return _getOrderBook(_maturity).getBorrowOrderBook(_start, _limit);
    }

    function getLendOrderBook(
        uint256 _maturity,
        uint256 _start,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        )
    {
        return _getOrderBook(_maturity).getLendOrderBook(_start, _limit);
    }

    function getItayoseEstimation(
        uint256 _maturity
    )
        external
        view
        returns (
            uint256 openingUnitPrice,
            uint256 lastLendUnitPrice,
            uint256 lastBorrowUnitPrice,
            uint256 totalOffsetAmount
        )
    {
        return _getOrderBook(_maturity).calculateItayoseResult();
    }

    function updateOrderFeeRate(uint256 _orderFeeRate) external {
        if (_orderFeeRate >= Constants.PCT_DIGIT) revert InvalidOrderFeeRate();

        uint256 previousRate = Storage.slot().orderFeeRate;

        if (_orderFeeRate != previousRate) {
            Storage.slot().orderFeeRate = _orderFeeRate;

            emit OrderFeeRateUpdated(Storage.slot().ccy, previousRate, _orderFeeRate);
        }
    }

    function updateCircuitBreakerLimitRange(uint256 _cbLimitRange) external {
        if (_cbLimitRange >= Constants.PCT_DIGIT) revert InvalidCircuitBreakerLimitRange();

        uint256 previousRange = Storage.slot().circuitBreakerLimitRange;

        if (_cbLimitRange != previousRange) {
            Storage.slot().circuitBreakerLimitRange = _cbLimitRange;

            emit CircuitBreakerLimitRangeUpdated(Storage.slot().ccy, previousRange, _cbLimitRange);
        }
    }

    function createOrderBook(
        uint256 _maturity,
        uint256 _openingDate,
        uint256 _preOpeningDate
    ) public {
        Storage.slot().isReady[_maturity] = _getOrderBook(_maturity).initialize(
            _maturity,
            _openingDate,
            _preOpeningDate
        );

        emit OrderBookCreated(_maturity, _openingDate);
    }

    function executeAutoRoll(
        uint256 _maturedOrderBookMaturity,
        uint256 _destinationOrderBookMaturity,
        uint256 _autoRollUnitPrice
    ) external {
        OrderBookLib.OrderBook storage maturedOrderBook = Storage.slot().orderBooks[
            _maturedOrderBookMaturity
        ];

        if (maturedOrderBook.maturity != _maturedOrderBookMaturity)
            revert InvalidMaturity(_maturedOrderBookMaturity);
        if (!maturedOrderBook.isMatured()) revert OrderBookNotMatured();

        OrderBookLib.OrderBook storage destinationOrderBook = Storage.slot().orderBooks[
            _destinationOrderBookMaturity
        ];

        if (destinationOrderBook.maturity != _destinationOrderBookMaturity)
            revert InvalidMaturity(_destinationOrderBookMaturity);

        // NOTE: The auto-roll destination order book has no market unit price if the order has never been filled before.
        // In this case, the market unit price is updated with the unit price of the auto-roll.
        if (destinationOrderBook.getMarketUnitPrice(false) == 0) {
            destinationOrderBook.setInitialBlockUnitPrice(_autoRollUnitPrice);
        }
    }

    function executeItayoseCall(
        uint256 _maturity
    )
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
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_maturity);

        (openingUnitPrice, lastLendUnitPrice, lastBorrowUnitPrice, totalOffsetAmount) = orderBook
            .calculateItayoseResult();

        if (totalOffsetAmount > 0) {
            ProtocolTypes.Side[2] memory sides = [
                ProtocolTypes.Side.LEND,
                ProtocolTypes.Side.BORROW
            ];

            for (uint256 i; i < sides.length; i++) {
                ProtocolTypes.Side partiallyFilledOrderSide;
                PartiallyFilledOrder memory partiallyFilledOrder;
                FilledOrder memory filledOrder;
                (filledOrder, partiallyFilledOrder, , ) = orderBook.fillOrders(
                    sides[i],
                    totalOffsetAmount,
                    0,
                    0
                );

                if (filledOrder.futureValue > 0) {
                    orderBook.setInitialBlockUnitPrice(openingUnitPrice);
                }

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

    function _getOrderBook(
        uint256 _maturity
    ) private view returns (OrderBookLib.OrderBook storage) {
        return Storage.slot().orderBooks[_maturity];
    }
}
