// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../ProtocolTypes.sol";

interface ILendingMarket {
    struct MarketOrder {
        ProtocolTypes.Side side;
        uint256 amount;
        uint256 rate; // in basis points
        address maker;
    }

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
        uint256 term,
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

    function cancelOrder(uint256 orderId) external returns (bool success);

    function getBorrowRate() external view returns (uint256 rate);

    function getLendRate() external view returns (uint256 rate);

    function getMaker(uint256 orderId) external view returns (address maker);

    function getMidRate() external view returns (uint256 rate);

    function getOrder(uint256 orderId) external view returns (MarketOrder memory);

    function getOrderFromTree(uint256 orderId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        );

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
