// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import {MarketOrder, ItayoseLog} from "../storages/LendingMarketStorage.sol";

interface ILendingMarket {
    struct OrderExecutionConditions {
        bool isFilled;
        uint256 executedUnitPrice;
        bool ignoreRemainingAmount;
        bool orderExists;
    }

    struct PlacedOrder {
        uint48 orderId;
        uint256 amount;
        uint256 unitPrice;
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

    event OrderCanceled(
        uint48 orderId,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 ccy,
        uint256 maturity,
        uint256 amount,
        uint256 unitPrice
    );

    event OrdersCleaned(
        uint48[] orderIds,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 indexed ccy,
        uint256 maturity,
        uint256 amount,
        uint256 futureValue
    );

    event OrderExecuted(
        address indexed user,
        ProtocolTypes.Side side,
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 inputAmount,
        uint256 inputUnitPrice,
        uint256 filledAmount,
        uint256 filledUnitPrice,
        uint256 filledFutureValue,
        uint48 placedOrderId,
        uint256 placedAmount,
        uint256 placedUnitPrice,
        bool isCircuitBreakerTriggered
    );

    event PreOrderExecuted(
        address indexed user,
        ProtocolTypes.Side side,
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 amount,
        uint256 unitPrice,
        uint48 orderId
    );

    event PositionUnwound(
        address indexed user,
        ProtocolTypes.Side side,
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 inputFutureValue,
        uint256 filledAmount,
        uint256 filledUnitPrice,
        uint256 filledFutureValue,
        bool isCircuitBreakerTriggered
    );

    event MarketOpened(uint256 maturity, uint256 prevMaturity);

    event ItayoseExecuted(
        bytes32 ccy,
        uint256 maturity,
        uint256 openingUnitPrice,
        uint256 lastLendUnitPrice,
        uint256 lastBorrowUnitPrice,
        uint256 offsetAmount
    );

    struct Market {
        bytes32 ccy;
        uint256 maturity;
        uint256 openingDate;
        uint256 borrowUnitPrice;
        uint256 lendUnitPrice;
        uint256 midUnitPrice;
        uint256 openingUnitPrice;
        bool isReady;
    }

    function getMarket() external view returns (Market memory);

    function getCircuitBreakerThresholds(uint256 _circuitBreakerLimitRange)
        external
        view
        returns (uint256 lendCircuitBreakerThreshold, uint256 borrowCircuitBreakerThreshold);

    function getBorrowUnitPrice() external view returns (uint256 unitPrice);

    function getLendUnitPrice() external view returns (uint256 unitPrice);

    function getMidUnitPrice() external view returns (uint256 unitPrice);

    function getBorrowOrderBook(uint256 limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getLendOrderBook(uint256 limit)
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getMaturity() external view returns (uint256);

    function getCurrency() external view returns (bytes32);

    function getOpeningDate() external view returns (uint256);

    function isReady() external view returns (bool);

    function isMatured() external view returns (bool);

    function isOpened() external view returns (bool);

    function isItayosePeriod() external view returns (bool);

    function isPreOrderPeriod() external returns (bool);

    function getItayoseLog(uint256 maturity) external view returns (ItayoseLog memory);

    function getOrder(uint48 orderId)
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

    function getTotalAmountFromLendOrders(address user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        );

    function getTotalAmountFromBorrowOrders(address user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        );

    function getLendOrderIds(address user)
        external
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds);

    function getBorrowOrderIds(address user)
        external
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds);

    function calculateFilledAmount(
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

    function openMarket(uint256 maturity, uint256 openingDate) external returns (uint256);

    function cancelOrder(address user, uint48 orderId) external;

    function executeOrder(
        ProtocolTypes.Side side,
        address account,
        uint256 amount,
        uint256 unitPrice,
        uint256 circuitBreakerLimitRange
    )
        external
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder);

    function executePreOrder(
        ProtocolTypes.Side side,
        address user,
        uint256 amount,
        uint256 unitPrice
    ) external;

    function unwindPosition(
        ProtocolTypes.Side side,
        address user,
        uint256 futureValue,
        uint256 circuitBreakerLimitRange
    )
        external
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder);

    function executeItayoseCall()
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        );

    function cleanUpOrders(address user)
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
