// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import {MarketOrder} from "../storages/LendingMarketStorage.sol";

interface ILendingMarket {
    event OrderCanceled(
        uint48 orderId,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 ccy,
        uint256 maturity,
        uint256 amount,
        uint256 unitPrice
    );
    event OrderMade(
        uint48 orderId,
        uint48 originalOrderId,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 ccy,
        uint256 maturity,
        uint256 amount,
        uint256 unitPrice
    );
    event OrdersTaken(
        address indexed taker,
        ProtocolTypes.Side side,
        bytes32 ccy,
        uint256 maturity,
        uint256 filledAmount,
        uint256 unitPrice,
        uint256 filledFutureValue
    );

    event OrdersCleaned(
        uint48[] orderIds,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 indexed ccy,
        uint256 maturity
    );

    event MarketOpened(uint256 maturity, uint256 prevMaturity);

    event ItayoseExecuted(bytes32 ccy, uint256 maturity, uint256 openingPrice);

    struct Market {
        bytes32 ccy;
        uint256 maturity;
        uint256 openingDate;
        uint256 borrowUnitPrice;
        uint256 lendUnitPrice;
        uint256 midUnitPrice;
    }

    function getMarket() external view returns (Market memory);

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

    function isItayosePeriod() external view returns (bool);

    function getOpeningUnitPrice() external view returns (uint256);

    function isMatured() external view returns (bool);

    function isOpened() external view returns (bool);

    function isPreOrderPeriod() external returns (bool);

    function getOrder(uint48 _orderId)
        external
        view
        returns (
            ProtocolTypes.Side,
            uint256 unitPrice,
            uint256 maturity,
            address maker,
            uint256 amount,
            uint256 timestamp
        );

    function getTotalAmountFromLendOrders(address _user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        );

    function getTotalAmountFromBorrowOrders(address _user)
        external
        view
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        );

    function getActiveLendOrderIds(address _user)
        external
        view
        returns (uint48[] memory activeOrderIds);

    function getActiveBorrowOrderIds(address _user)
        external
        view
        returns (uint48[] memory activeOrderIds);

    function estimateFilledAmount(ProtocolTypes.Side _side, uint256 _futureValue)
        external
        view
        returns (uint256 amount);

    function openMarket(uint256 maturity, uint256 openingDate) external returns (uint256);

    function cancelOrder(address user, uint48 orderId)
        external
        returns (
            ProtocolTypes.Side,
            uint256,
            uint256
        );

    function createPreOrder(
        ProtocolTypes.Side side,
        address user,
        uint256 amount,
        uint256 unitPrice
    ) external;

    function unwindOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _futureValue
    ) external returns (uint256 filledAmount, uint256 filledFutureValue);

    function executeItayoseCall() external;

    function cleanOrders(address _user)
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

    function createOrder(
        ProtocolTypes.Side side,
        address account,
        uint256 amount,
        uint256 unitPrice,
        bool ignoreRemainingAmount
    ) external returns (uint256 executedRate, uint256 remainingAmount);

    function pauseMarket() external;

    function unpauseMarket() external;
}
