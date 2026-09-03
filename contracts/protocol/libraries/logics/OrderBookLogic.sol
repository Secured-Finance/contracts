// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {Constants} from "../Constants.sol";
import {OrderBookLib, FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
import {LendingMarketStorage as Storage, ItayoseLog, ItayoseProcess} from "../../storages/LendingMarketStorage.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";

struct ItayoseSettlementResult {
    ProtocolTypes.Side makerSide;
    uint256 batchFilledAmount;
    uint256 remainingLendOffsetAmount;
    uint256 remainingBorrowOffsetAmount;
    PartiallyFilledOrder partiallyFilledOrder;
}

struct ItayoseFinalizeResult {
    uint256 openingUnitPrice;
    uint256 totalOffsetAmount;
    uint256 openingDate;
}

struct ItayoseProcessStatus {
    uint256 openingUnitPrice;
    uint256 lastLendUnitPrice;
    uint256 lastBorrowUnitPrice;
    uint256 totalOffsetAmount;
    uint256 remainingLendOffsetAmount;
    uint256 remainingBorrowOffsetAmount;
    bool isInProgress;
    bool isFinalizable;
    bool isReady;
}

library OrderBookLogic {
    using OrderBookLib for OrderBookLib.OrderBook;
    using RoundingUint256 for uint256;

    error InvalidOrderFeeRate();
    error InvalidCircuitBreakerLimitRange();
    error OrderBookNotMatured();
    error ItayoseProcessAlreadyInitialized();
    error ItayoseProcessNotInitialized();
    error ItayoseSettlementAlreadyCompleted();
    error ItayoseProcessNotFinalizable();
    error ItayoseSettlementDidNotProgress();
    error UnexpectedPartialFill();

    // Provisional value based on the existing performance measurement where 500 price levels
    // consumed approximately 8M gas. The performance test phase may tune this value.
    uint256 internal constant MAX_ITAYOSE_PRICE_LEVELS_PER_CALL = 500;

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

    function migrateOrderChunks(
        uint8 _orderBookId,
        ProtocolTypes.Side _side,
        uint256 _unitPrice
    ) external {
        _getOrderBook(_orderBookId).migrateOrderChunks(_side, _unitPrice);
    }

    function isReady(uint8 _orderBookId) public view returns (bool) {
        return Storage.slot().isReady[_getOrderBook(_orderBookId).maturity];
    }

    function isMatured(uint8 _orderBookId) public view returns (bool) {
        return _getOrderBook(_orderBookId).isMatured();
    }

    function isOpened(uint8 _orderBookId) public view returns (bool) {
        return
            isReady(_orderBookId) &&
            !isMatured(_orderBookId) &&
            block.timestamp >= _getOrderBook(_orderBookId).openingDate;
    }

    function isItayosePeriod(uint8 _orderBookId) public view returns (bool) {
        return
            block.timestamp >=
            (_getOrderBook(_orderBookId).openingDate - OrderBookLib.ITAYOSE_PERIOD) &&
            !isReady(_orderBookId);
    }

    function isPreOrderPeriod(uint8 _orderBookId) public view returns (bool) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        return
            block.timestamp >= orderBook.preOpeningDate &&
            block.timestamp < (orderBook.openingDate - OrderBookLib.ITAYOSE_PERIOD);
    }

    function getOrderBookDetail(
        uint8 _orderBookId
    )
        public
        view
        returns (bytes32 ccy, uint256 maturity, uint256 openingDate, uint256 preOpeningDate)
    {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);

        ccy = Storage.slot().ccy;
        maturity = orderBook.maturity;
        openingDate = orderBook.openingDate;
        preOpeningDate = orderBook.preOpeningDate;
    }

    function getLastOrderTimestamp(uint8 _orderBookId) external view returns (uint48) {
        return _getOrderBook(_orderBookId).lastOrderTimestamp;
    }

    function getBlockUnitPriceHistory(
        uint8 _orderBookId
    ) external view returns (uint256[] memory unitPrices, uint48 timestamp) {
        return _getOrderBook(_orderBookId).getBlockUnitPriceHistory(true);
    }

    function getMarketUnitPrice(uint8 _orderBookId) external view returns (uint256) {
        return _getOrderBook(_orderBookId).getMarketUnitPrice(true);
    }

    function getBlockUnitPriceAverage(
        uint8 _orderBookId,
        uint256 _count
    ) external view returns (uint256) {
        return _getOrderBook(_orderBookId).getBlockUnitPriceAverage(_count, true);
    }

    function getCircuitBreakerThresholds(
        uint8 _orderBookId
    ) external view returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice) {
        maxLendUnitPrice = _getOrderBook(_orderBookId).getLendCircuitBreakerThreshold(
            Storage.slot().circuitBreakerLimitRange,
            true
        );
        minBorrowUnitPrice = _getOrderBook(_orderBookId).getBorrowCircuitBreakerThreshold(
            Storage.slot().circuitBreakerLimitRange,
            true
        );
    }

    function getBestLendUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        return _getOrderBook(_orderBookId).getBestLendUnitPrice();
    }

    function getBestLendUnitPrices(
        uint8[] memory _orderBookIds
    ) external view returns (uint256[] memory unitPrices) {
        unitPrices = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            unitPrices[i] = _getOrderBook(_orderBookIds[i]).getBestLendUnitPrice();
        }
    }

    function getBestBorrowUnitPrice(uint8 _orderBookId) public view returns (uint256) {
        return _getOrderBook(_orderBookId).getBestBorrowUnitPrice();
    }

    function getBestBorrowUnitPrices(
        uint8[] memory _orderBookIds
    ) external view returns (uint256[] memory unitPrices) {
        unitPrices = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            unitPrices[i] = _getOrderBook(_orderBookIds[i]).getBestBorrowUnitPrice();
        }
    }

    function getBorrowOrderBook(
        uint8 _orderBookId,
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
        return _getOrderBook(_orderBookId).getBorrowOrderBook(_start, _limit);
    }

    function getLendOrderBook(
        uint8 _orderBookId,
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
        return _getOrderBook(_orderBookId).getLendOrderBook(_start, _limit);
    }

    function getItayoseEstimation(
        uint8 _orderBookId
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
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        ItayoseProcess storage process = Storage.slot().itayoseProcesses[orderBook.maturity];

        if (process.isInProgress) {
            ItayoseLog storage log = Storage.slot().itayoseLogs[orderBook.maturity];
            return (
                log.openingUnitPrice,
                log.lastLendUnitPrice,
                log.lastBorrowUnitPrice,
                process.totalOffsetAmount
            );
        }

        return orderBook.calculateItayoseResult();
    }

    function getItayoseProcessStatus(
        uint8 _orderBookId
    ) external view returns (ItayoseProcessStatus memory status) {
        return _getItayoseProcessStatus(_getOrderBook(_orderBookId));
    }

    function getMaturities(
        uint8[] memory _orderBookIds
    ) public view returns (uint256[] memory maturities) {
        maturities = new uint256[](_orderBookIds.length);

        for (uint256 i; i < _orderBookIds.length; i++) {
            maturities[i] = _getOrderBook(_orderBookIds[i]).maturity;
        }
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
    ) public returns (uint8 orderBookId) {
        orderBookId = _nextOrderBookId();

        Storage.slot().isReady[_maturity] = _getOrderBook(orderBookId).initialize(
            _maturity,
            _openingDate,
            _preOpeningDate
        );

        emit OrderBookCreated(orderBookId, _maturity, _openingDate);
    }

    function executeAutoRoll(
        uint8 _maturedOrderBookId,
        uint8 _destinationOrderBookId,
        uint256 _autoRollUnitPrice
    ) external {
        OrderBookLib.OrderBook storage maturedOrderBook = Storage.slot().orderBooks[
            _maturedOrderBookId
        ];

        if (!maturedOrderBook.isMatured()) revert OrderBookNotMatured();

        OrderBookLib.OrderBook storage destinationOrderBook = Storage.slot().orderBooks[
            _destinationOrderBookId
        ];

        // NOTE: The auto-roll destination order book has no market unit price if the order has never been filled before.
        // In this case, the market unit price is updated with the unit price of the auto-roll.
        if (destinationOrderBook.getMarketUnitPrice(false) == 0) {
            destinationOrderBook.setInitialBlockUnitPrice(_autoRollUnitPrice);
        }
    }

    function initializeItayose(uint8 _orderBookId) external returns (ItayoseProcessStatus memory) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        uint256 maturity = orderBook.maturity;
        ItayoseProcess storage process = Storage.slot().itayoseProcesses[maturity];

        if (process.isInProgress || Storage.slot().isReady[maturity]) {
            revert ItayoseProcessAlreadyInitialized();
        }

        ItayoseLog memory log;
        (
            log.openingUnitPrice,
            log.lastLendUnitPrice,
            log.lastBorrowUnitPrice,
            process.totalOffsetAmount
        ) = orderBook.calculateItayoseResult();

        process.isInProgress = true;
        process.remainingLendOffsetAmount = process.totalOffsetAmount;
        process.remainingBorrowOffsetAmount = process.totalOffsetAmount;
        Storage.slot().itayoseLogs[maturity] = log;

        if (process.totalOffsetAmount > 0) {
            orderBook.setInitialBlockUnitPrice(log.openingUnitPrice);
        }

        return _getItayoseProcessStatus(orderBook);
    }

    function executeItayoseSettlement(
        uint8 _orderBookId
    ) external returns (ItayoseSettlementResult memory result) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        ItayoseProcess storage process = Storage.slot().itayoseProcesses[orderBook.maturity];

        if (!process.isInProgress) revert ItayoseProcessNotInitialized();

        if (process.remainingBorrowOffsetAmount > 0) {
            // fillOrders receives the taker side. LEND therefore settles BORROW makers.
            result = _settleItayoseSide(orderBook, process, ProtocolTypes.Side.LEND);
        } else if (process.remainingLendOffsetAmount > 0) {
            // fillOrders receives the taker side. BORROW therefore settles LEND makers.
            result = _settleItayoseSide(orderBook, process, ProtocolTypes.Side.BORROW);
        } else {
            revert ItayoseSettlementAlreadyCompleted();
        }

        result.remainingLendOffsetAmount = process.remainingLendOffsetAmount;
        result.remainingBorrowOffsetAmount = process.remainingBorrowOffsetAmount;
    }

    function finalizeItayose(
        uint8 _orderBookId
    ) external returns (ItayoseFinalizeResult memory result) {
        OrderBookLib.OrderBook storage orderBook = _getOrderBook(_orderBookId);
        uint256 maturity = orderBook.maturity;
        ItayoseProcess storage process = Storage.slot().itayoseProcesses[maturity];

        if (!process.isInProgress) revert ItayoseProcessNotInitialized();
        if (process.remainingLendOffsetAmount != 0 || process.remainingBorrowOffsetAmount != 0)
            revert ItayoseProcessNotFinalizable();

        ItayoseLog storage log = Storage.slot().itayoseLogs[maturity];
        result.openingUnitPrice = log.openingUnitPrice;
        result.totalOffsetAmount = process.totalOffsetAmount;
        result.openingDate = orderBook.openingDate;

        Storage.slot().isReady[maturity] = true;
        process.isInProgress = false;

        if (process.totalOffsetAmount > 0) {
            emit ItayoseExecuted(
                Storage.slot().ccy,
                maturity,
                log.openingUnitPrice,
                log.lastLendUnitPrice,
                log.lastBorrowUnitPrice,
                process.totalOffsetAmount
            );
        }
    }

    function _settleItayoseSide(
        OrderBookLib.OrderBook storage orderBook,
        ItayoseProcess storage process,
        ProtocolTypes.Side takerSide
    ) private returns (ItayoseSettlementResult memory result) {
        uint256 remainingOffsetAmount = takerSide == ProtocolTypes.Side.LEND
            ? process.remainingBorrowOffsetAmount
            : process.remainingLendOffsetAmount;
        uint256 boundaryUnitPrice = orderBook.getItayoseBoundaryUnitPrice(
            takerSide,
            MAX_ITAYOSE_PRICE_LEVELS_PER_CALL
        );

        FilledOrder memory filledOrder;
        (filledOrder, result.partiallyFilledOrder, , ) = orderBook.fillOrders(
            takerSide,
            remainingOffsetAmount,
            0,
            boundaryUnitPrice
        );

        if (filledOrder.amount == 0) revert ItayoseSettlementDidNotProgress();

        remainingOffsetAmount -= filledOrder.amount;
        if (
            remainingOffsetAmount > 0 &&
            (result.partiallyFilledOrder.orderId != 0 ||
                result.partiallyFilledOrder.maker != address(0) ||
                result.partiallyFilledOrder.amount != 0 ||
                result.partiallyFilledOrder.futureValue != 0)
        ) revert UnexpectedPartialFill();

        if (takerSide == ProtocolTypes.Side.LEND) {
            process.remainingBorrowOffsetAmount = remainingOffsetAmount;
        } else {
            process.remainingLendOffsetAmount = remainingOffsetAmount;
        }

        result.makerSide = takerSide == ProtocolTypes.Side.LEND
            ? ProtocolTypes.Side.BORROW
            : ProtocolTypes.Side.LEND;
        result.batchFilledAmount = filledOrder.amount;
    }

    function _getItayoseProcessStatus(
        OrderBookLib.OrderBook storage orderBook
    ) private view returns (ItayoseProcessStatus memory status) {
        ItayoseProcess storage process = Storage.slot().itayoseProcesses[orderBook.maturity];
        ItayoseLog storage log = Storage.slot().itayoseLogs[orderBook.maturity];

        status.openingUnitPrice = log.openingUnitPrice;
        status.lastLendUnitPrice = log.lastLendUnitPrice;
        status.lastBorrowUnitPrice = log.lastBorrowUnitPrice;
        status.totalOffsetAmount = process.totalOffsetAmount;
        status.remainingLendOffsetAmount = process.remainingLendOffsetAmount;
        status.remainingBorrowOffsetAmount = process.remainingBorrowOffsetAmount;
        status.isInProgress = process.isInProgress;
        status.isFinalizable =
            process.isInProgress &&
            process.remainingLendOffsetAmount == 0 &&
            process.remainingBorrowOffsetAmount == 0;
        status.isReady = Storage.slot().isReady[orderBook.maturity];
    }

    function _nextOrderBookId() internal returns (uint8) {
        // NOTE: Originally, matured ordebooks were reused as new orderbooks after auto-rolls, but this reusing logic has been removed.
        // This means that `orderBookId` is increased in proportion to the number of auto-rolls executed. To avoid overflow of `orderBookId`,
        // `orderBookId` circulate between 1 and 255.
        if (Storage.slot().lastOrderBookId == type(uint8).max) {
            Storage.slot().lastOrderBookId = 1;
        } else {
            Storage.slot().lastOrderBookId++;
        }
        return Storage.slot().lastOrderBookId;
    }

    function _getOrderBook(
        uint8 _orderBookId
    ) private view returns (OrderBookLib.OrderBook storage) {
        return Storage.slot().orderBooks[_orderBookId];
    }
}
