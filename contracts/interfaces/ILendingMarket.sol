// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import {MarketOrder} from "../storages/LendingMarketStorage.sol";

interface ILendingMarket {
    event CancelOrder(
        uint256 orderId,
        address indexed maker,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    );
    event MakeOrder(
        uint256 orderId,
        address indexed maker,
        ProtocolTypes.Side side,
        bytes32 ccy,
        uint256 maturity,
        uint256 amount,
        uint256 rate
    );
    event TakeOrder(
        uint256 orderId,
        address indexed taker,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    );

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

    function getMaker(uint256 orderId) external view returns (address maker);

    function getMarket() external view returns (Market memory);

    function getMidRate() external view returns (uint256 rate);

    function getMaturity() external view returns (uint256);

    function getCurrency() external view returns (bytes32);

    function getOrder(uint256 orderId) external view returns (MarketOrder memory);

    function getOrderFromTree(uint256 _maturity, uint256 _orderId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        );

    function futureValueOf(address account) external view returns (int256);

    function presentValueOf(address account) external view returns (int256);

    function openMarket(uint256 maturity) external returns (uint256);

    function cancelOrder(uint256 orderId) external returns (bool success);

    function matchOrders(
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    ) external view returns (uint256);

    function order(
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    ) external returns (bool);

    function pauseMarket() external;

    function unpauseMarket() external;
}
