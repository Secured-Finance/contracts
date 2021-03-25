// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct MarketOrder { 
    uint8 side;
    uint256 amount;
    uint256 rate;
    uint256 deadline;
    address maker; 
}

interface ILendingMarket {
    event CancelOrder(uint256 id, address indexed maker, uint8 side, uint256 amount, uint256 rate);
    event MakeOrder(uint256 id, address indexed maker, uint8 side, uint8 ccy, uint8 term, uint256 amount, uint256 rate, uint256 deadline);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TakeOrder(uint256 id, address indexed taker, uint8 side, uint256 amount, uint256 rate);

    function MarketCcy() external view returns (uint8);
    function MarketTerm() external view returns (uint8);
    function last_order_id() external view returns (uint256);
    function orders(uint256) external view returns (uint8 side, uint256 amount, uint256 rate, uint256 deadline, address maker);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
    function setCollateral(address colAddr) external;
    function isActive(uint256 id) external returns (bool active);
    function getMaker(uint256 id) external view returns (address maker);
    function getBorrowRate() external view returns (uint256 rate);
    function getLendRate() external view returns (uint256 rate);
    function getMidRate() external view returns (uint256 rate);
    function getOrder(uint256 id) external view returns (MarketOrder memory);
    function getOrderFromTree(uint8 side, uint256 rate, uint256 orderId) external view returns (uint256, uint256, uint256, uint256, uint256);
    function cancelOrder(uint256 id) external returns (bool success);
    // function makeOrder(uint8 _side, uint256 _amount, uint256 _rate, uint256 _deadline) external returns (uint256 id);
    // function takeOrder(uint256 id, uint256 _amount) external returns (bool);
    function matchOrders(uint8 side, uint256 amount, uint256 rate) external view returns (uint256);
    function order(uint8 side, uint256 amount, uint256 rate, uint256 deadline) external returns (bool);
}