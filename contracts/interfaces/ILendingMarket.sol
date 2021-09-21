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
    event CancelOrder(uint256 orderId,address indexed maker,uint8 side,uint256 amount,uint256 rate);
    event MakeOrder(uint256 orderId,address indexed maker,uint8 side,bytes32 ccy,uint8 term,uint256 amount,uint256 rate);
    event Paused(address account);
    event TakeOrder(uint256 orderId,address indexed taker,uint8 side,uint256 amount,uint256 rate);
    event Unpaused(address account);

    function MarketCcy() external view returns (bytes32);
    function MarketTerm() external view returns (uint8);
    function cancelOrder(uint256 orderId) external  returns (bool success);
    function getBorrowRate() external view returns (uint256 rate);
    function getLendRate() external view returns (uint256 rate);
    function getMaker(uint256 orderId) external view returns (address maker);
    function getMidRate() external view returns (uint256 rate);
    function getOrder(uint256 orderId) external view returns (MarketOrder memory);
    function getOrderFromTree(uint256 orderId) external view returns (uint256 , uint256 , uint256 , uint256 , uint256);
    function last_order_id() external view returns (uint256);
    function lendingController() external view returns (address);
    function matchOrders(uint8 side,uint256 amount,uint256 rate) external view returns (uint256);
    function order(uint8 side,uint256 amount,uint256 rate) external  returns (bool);
    function orders(uint256) external view returns (uint8 side, uint256 amount, uint256 rate, address maker);
    function pauseMarket() external;
    function paused() external view returns (bool);
    function setCollateral(address colAddr) external;
    function setLoan(address addr) external;
    function unpauseMarket() external;
}