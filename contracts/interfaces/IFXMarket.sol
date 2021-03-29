// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct FXInput { 
    uint8 ccyBuy;
    uint8 ccySell;
    uint256 amtBuy;
    uint256 amtSell; 
}

struct FXItem { 
    uint8 pair;
    uint8 ccyBuy;
    uint8 ccySell;
    uint256 amtBuy;
    uint256 amtSell;
    uint256 rate;
    uint256 goodtil;
    bool isAvailable;
    address addr; 
}

struct FXBook { 
    FXItem[3] bids;
    FXItem[3] offers;
    bool isValue; 
}

interface IFXMarket {
    event DelFXBook(address indexed addr);
    event DelOneItem(address indexed addr);
    event SetFXBook(address indexed addr);
    
    function getMarketMakers() external view returns (address[] memory);
    function setFXBook(uint8 pair,  FXInput memory offerInput, FXInput memory bidInput, uint256 effectiveSec) external;
    function delFXBook() external;
    function delOneItem(address addr, uint8 side, uint8 pair) external;
    function getOneItem(address addr, uint8 side, uint8 pair) external view returns (FXItem memory);
    function getOneBook(address addr) external view returns (FXBook memory);
    function getAllBooks() external view returns (FXBook[] memory);
    function getBestBook() external view returns (FXBook memory);
    function getOfferRates() external view returns (uint256[3] memory);
    function getBidRates() external view returns (uint256[3] memory);
    function getMidRates() external view returns (uint256[3] memory);
    function getETHvalue(uint256 amount, uint8 ccy) external view returns (uint256);
}