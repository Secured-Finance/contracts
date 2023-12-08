// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../types/ProtocolTypes.sol";
import {ItayoseLog} from "../storages/LendingMarketStorage.sol";
import {OrderBookLib, FilledOrder, PartiallyFilledOrder} from "../libraries/OrderBookLib.sol";

interface ILendingMarket {
    error NoOrderExists();
    error CallerNotMaker();
    error MarketNotOpened();
    error AlreadyItayosePeriod();
    error NotItayosePeriod();
    error NotPreOrderPeriod();

    function getOrderBookDetail(
        uint256 maturity
    ) external view returns (bytes32 ccy, uint256 openingDate, uint256 preOpeningDate);

    function getCircuitBreakerThresholds(
        uint256 maturity
    )
        external
        view
        returns (uint256 lendCircuitBreakerThreshold, uint256 borrowCircuitBreakerThreshold);

    function getBestLendUnitPrice(uint256 maturity) external view returns (uint256 unitPrice);

    function getBestLendUnitPrices(
        uint256[] calldata _maturities
    ) external view returns (uint256[] memory);

    function getBestBorrowUnitPrice(uint256 maturity) external view returns (uint256 unitPrice);

    function getBestBorrowUnitPrices(
        uint256[] calldata _maturities
    ) external view returns (uint256[] memory);

    function getMarketUnitPrice(uint256 maturity) external view returns (uint256);

    function getLastOrderTimestamp(uint256 maturity) external view returns (uint48);

    function getBlockUnitPriceHistory(
        uint256 maturity
    ) external view returns (uint256[] memory unitPrices, uint48 timestamp);

    function getBlockUnitPriceAverage(
        uint256 maturity,
        uint256 count
    ) external view returns (uint256);

    function getBorrowOrderBook(
        uint256 maturity,
        uint256 start,
        uint256 limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        );

    function getLendOrderBook(
        uint256 maturity,
        uint256 start,
        uint256 limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        );

    function getItayoseEstimation(
        uint256 maturity
    )
        external
        view
        returns (
            uint256 openingUnitPrice,
            uint256 lastLendUnitPrice,
            uint256 lastBorrowUnitPrice,
            uint256 totalOffsetAmount
        );

    function getCurrency() external view returns (bytes32);

    function getOrderFeeRate() external view returns (uint256);

    function getCircuitBreakerLimitRange() external view returns (uint256);

    function getOpeningDate(uint256 maturity) external view returns (uint256);

    function isReady(uint256 maturity) external view returns (bool);

    function isMatured(uint256 maturity) external view returns (bool);

    function isOpened(uint256 maturity) external view returns (bool);

    function isItayosePeriod(uint256 maturity) external view returns (bool);

    function isPreOrderPeriod(uint256 maturity) external returns (bool);

    function getItayoseLog(uint256 maturity) external view returns (ItayoseLog memory);

    function getOrder(
        uint256 maturity,
        uint48 orderId
    )
        external
        view
        returns (
            ProtocolTypes.Side,
            uint256 unitPrice,
            address maker,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        );

    function getTotalAmountFromLendOrders(
        uint256 maturity,
        address user
    )
        external
        view
        returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue);

    function getTotalAmountFromBorrowOrders(
        uint256 maturity,
        address user,
        uint256 _minUnitPrice
    )
        external
        view
        returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue);

    function getLendOrderIds(
        uint256 maturity,
        address user
    ) external view returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds);

    function getBorrowOrderIds(
        uint256 maturity,
        address user
    ) external view returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds);

    function calculateFilledAmount(
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    )
        external
        view
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 feeInFV,
            uint256 placedAmount
        );

    function createOrderBook(
        uint256 maturity,
        uint256 openingDate,
        uint256 preOpeningDate
    ) external;

    function executeAutoRoll(
        uint256 maturedOrderBookMaturity,
        uint256 destinationOrderBookMaturity,
        uint256 autoRollUnitPrice
    ) external;

    function cancelOrder(uint256 maturity, address user, uint48 orderId) external;

    function executeOrder(
        uint256 maturity,
        ProtocolTypes.Side side,
        address account,
        uint256 amount,
        uint256 unitPrice
    )
        external
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV
        );

    function executePreOrder(
        uint256 maturity,
        ProtocolTypes.Side side,
        address user,
        uint256 amount,
        uint256 unitPrice
    ) external;

    function unwindPosition(
        uint256 maturity,
        ProtocolTypes.Side side,
        address user,
        uint256 futureValue
    )
        external
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV
        );

    function executeItayoseCall(
        uint256 maturity
    )
        external
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        );

    function cleanUpOrders(
        uint256 maturity,
        address user
    )
        external
        returns (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 removedLendOrderAmount,
            uint256 removedBorrowOrderAmount
        );

    function updateOrderFeeRate(uint256 orderFeeRate) external;

    function updateCircuitBreakerLimitRange(uint256 limitRange) external;

    function pause() external;

    function unpause() external;
}
