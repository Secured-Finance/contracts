// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./IDiscountFactors.sol";

struct Order {
    uint8 ccy;
    uint8 term;
    uint8 side;
    uint256 amount;
    uint256 rate;
}

interface ILendingMarketController is IDiscountFactors {
    event LendingMarketCreated(uint8 ccy,uint8 term,address indexed marketAddr);
    event LendingMarketsPaused(uint8 ccy);
    event LendingMarketsUnpaused(uint8 ccy);
    event OwnerChanged(address indexed oldOwner,address indexed newOwner);
    function deployLendingMarket(uint8 _ccy,uint8 _term) external  returns (address market);
    function getBorrowRatesForCcy(uint8 _ccy) external view returns (uint256[6] memory rates);
    function getDiscountFactorsForCcy(uint8 _ccy) external view returns (IDiscountFactors.DiscountFactor memory);
    function getLendRatesForCcy(uint8 _ccy) external view returns (uint256[6] memory rates);
    function getMidRatesForCcy(uint8 _ccy) external view returns (uint256[6] memory rates);
    function lendingMarkets(uint8 ,uint8) external view returns (address);
    function owner() external view returns (address);
    function pauseLendingMarkets(uint8 _ccy) external  returns (bool);
    function placeBulkOrders(Order[] memory orders) external  returns (bool);
    function setOwner(address _owner) external;
    function unpauseLendingMarkets(uint8 _ccy) external  returns (bool);
}