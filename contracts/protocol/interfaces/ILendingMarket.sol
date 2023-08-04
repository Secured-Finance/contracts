// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import {ItayoseLog} from "../storages/LendingMarketStorage.sol";
import {OrderBookLib, MarketOrder, FilledOrder, PartiallyFilledOrder} from "../libraries/OrderBookLib.sol";

interface ILendingMarket {
    struct OrderBook {
        bytes32 ccy;
        uint256 maturity;
        uint256 openingDate;
        uint256 borrowUnitPrice;
        uint256 lendUnitPrice;
        uint256 midUnitPrice;
        uint256 openingUnitPrice;
        bool isReady;
    }

    function getOrderBookDetail(uint8 orderBookId) external view returns (OrderBook memory);

    function getCircuitBreakerThresholds(uint8 orderBookId, uint256 _circuitBreakerLimitRange)
        external
        view
        returns (uint256 lendCircuitBreakerThreshold, uint256 borrowCircuitBreakerThreshold);

    function getBestLendUnitPrice(uint8 orderBookId) external view returns (uint256 unitPrice);

    function getBestLendUnitPrices() external view returns (uint256[] memory);

    function getBestBorrowUnitPrice(uint8 orderBookId) external view returns (uint256 unitPrice);

    function getBestBorrowUnitPrices() external view returns (uint256[] memory);

    function getMidUnitPrice(uint8 orderBookId) external view returns (uint256 unitPrice);

    function getMidUnitPrices() external view returns (uint256[] memory);

    function getBorrowOrderBook(uint8 orderBookId, uint256 limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getLendOrderBook(uint8 orderBookId, uint256 limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getMaturity(uint8 orderBookId) external view returns (uint256);

    function getOrderBookIds() external view returns (uint8[] memory orderBookIds);

    function getMaturities() external view returns (uint256[] memory maturities);

    function getCurrency() external view returns (bytes32);

    function getOpeningDate(uint8 orderBookId) external view returns (uint256);

    function isReady(uint8 orderBookId) external view returns (bool);

    function isMatured(uint8 orderBookId) external view returns (bool);

    function isOpened(uint8 orderBookId) external view returns (bool);

    function isItayosePeriod(uint8 orderBookId) external view returns (bool);

    function isPreOrderPeriod(uint8 orderBookId) external returns (bool);

    function getItayoseLog(uint256 maturity) external view returns (ItayoseLog memory);

    function getOrder(uint8 orderBookId, uint48 orderId)
        external
        view
        returns (
            ProtocolTypes.Side,
            uint256 unitPrice,
            uint256 maturity,
            address maker,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        );

    function getTotalAmountFromLendOrders(uint8 orderBookId, address user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        );

    function getTotalAmountFromBorrowOrders(uint8 orderBookId, address user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        );

    function getLendOrderIds(uint8 orderBookId, address user)
        external
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds);

    function getBorrowOrderIds(uint8 orderBookId, address user)
        external
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds);

    function calculateFilledAmount(
        uint8 orderBookId,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice,
        uint256 _circuitBreakerLimitRange
    )
        external
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV
        );

    function createOrderBook(uint256 maturity, uint256 _openingDate)
        external
        returns (uint8 orderBookId);

    function rotateOrderBooks(uint256 newMaturity)
        external
        returns (uint8 defaultOrderBookId, uint8 autoRollReferenceOrderBookId);

    function cancelOrder(
        uint8 orderBookId,
        address user,
        uint48 orderId
    ) external;

    function executeOrder(
        uint8 orderBookId,
        ProtocolTypes.Side side,
        address account,
        uint256 amount,
        uint256 unitPrice,
        uint256 circuitBreakerLimitRange
    )
        external
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder);

    function executePreOrder(
        uint8 orderBookId,
        ProtocolTypes.Side side,
        address user,
        uint256 amount,
        uint256 unitPrice
    ) external;

    function unwindPosition(
        uint8 orderBookId,
        ProtocolTypes.Side side,
        address user,
        uint256 futureValue,
        uint256 circuitBreakerLimitRange
    )
        external
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder);

    function executeItayoseCall(uint8 orderBookId)
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        );

    function cleanUpOrders(uint8 orderBookId, address user)
        external
        returns (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 removedLendOrderAmount,
            uint256 removedBorrowOrderAmount,
            uint256 maturity
        );

    function pauseMarket() external;

    function unpauseMarket() external;
}
