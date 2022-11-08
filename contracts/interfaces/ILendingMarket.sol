// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import {MarketOrder} from "../storages/LendingMarketStorage.sol";

interface ILendingMarket {
    event CancelOrder(
        uint48 orderId,
        address indexed maker,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    );
    event MakeOrder(
        uint48 orderId,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 ccy,
        uint256 maturity,
        uint256 amount,
        uint256 rate
    );
    // event TakeOrders(
    //     uint48[] orderIds,
    //     address indexed taker,
    //     ProtocolTypes.Side side,
    //     uint256 amount,
    //     uint256 rate
    // );
    event TakeOrders(address indexed taker, ProtocolTypes.Side side, uint256 amount, uint256 rate);

    event OpenMarket(uint256 maturity, uint256 prevMaturity);

    struct Market {
        bytes32 ccy;
        uint256 maturity;
        uint256 basisDate;
        uint256 borrowRate;
        uint256 lendRate;
        uint256 midRate;
    }

    function getBorrowRate() external view returns (uint256 rate);

    function getLendRate() external view returns (uint256 rate);

    function getMarket() external view returns (Market memory);

    function getMidRate() external view returns (uint256 rate);

    function getBorrowOrderBook(uint256 limit)
        external
        view
        returns (
            uint256[] memory rates,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getLendOrderBook(uint256 limit)
        external
        view
        returns (
            uint256[] memory rates,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getMaturity() external view returns (uint256);

    function getCurrency() external view returns (bytes32);

    function isMatured() external view returns (bool);

    function isOpened() external view returns (bool);

    function getOrder(uint48 _orderId)
        external
        view
        returns (
            ProtocolTypes.Side,
            uint256 rate,
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

    function openMarket(uint256 maturity) external returns (uint256);

    function cancelOrder(address user, uint48 orderId)
        external
        returns (
            ProtocolTypes.Side,
            uint256,
            uint256
        );

    // function matchOrders(
    //     ProtocolTypes.Side side,
    //     uint256 amount,
    //     uint256 rate
    // ) external view returns (uint256);

    function cleanOrders(address _user)
        external
        returns (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 maturity
        );

    function createOrder(
        ProtocolTypes.Side side,
        address account,
        uint256 amount,
        uint256 rate
    ) external returns (uint256 executedRate, uint256 remainingAmount);

    function pauseMarket() external;

    function unpauseMarket() external;
}
