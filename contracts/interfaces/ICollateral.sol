// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct ColBook { 
    string id;
    bytes userAddrFIL;
    bytes userAddrBTC;
    uint256 colAmtETH;
    uint256 inuseETH;
    uint256 inuseFIL;
    uint256 inuseUSDC;
    uint256 inuseBTC;
    bool isAvailable;
    uint8 state; 
}

interface ICollateral {
    event Deposit(address indexed addr,uint256 amount);
    event PartialLiquidation(address indexed borrower,address indexed lender,uint256 indexed amount,uint8 ccy);
    event Register(address indexed addr,string id,string userAddrFIL,string userAddrBTC,uint256 amount);
    event Release(address indexed addr,uint256 amount,uint8 ccy);
    event UpdateBTCAddress(address indexed addr,string btcAddr);
    event UpdateFILAddress(address indexed addr,string filAddr);
    event UpdateState(address indexed addr,uint8 prevState,uint8 currState);
    event UseCollateral(address indexed addr,uint256 amount,uint8 ccy);
    event Withdraw(address indexed addr,uint256 amount);

    function addLendingMarket(uint8 _ccy,uint8 _term,address _addr) external;
    function calculatePVinETH(address addr) external view returns (uint256);
    function completePartialLiquidation(address borrower) external;
    function deposit() external payable;
    function getAllBooks() external view returns (ColBook[] memory);
    function getAllUsers() external view returns (address[] memory);
    function getColState(address addr) external view returns (uint8);
    function getCoverage(address addr) external view returns (uint256);
    function getOneBook(address addr) external view returns (ColBook memory);
    function isCovered(uint256 amt,uint8 ccy,address addr) external view returns (bool);
    function isLendingMarket(uint8 _ccy,address _addr) external view returns (bool);
    function lendingMarkets(uint8 ,uint8 ) external view returns (address);
    function liquidate(address borrower,address lender,uint256 amount,uint8 ccy) external;
    function owner() external view returns (address);
    function register(string memory id,string memory userAddrFIL,string memory userAddrBTC) external payable;
    function releaseCollateral(uint8 ccy,uint256 amt,address addr) external;
    function setLoanAddr(address addr) external;
    function setRatesAggregatorAddr(address addr) external;
    function updateAllState() external;
    function updateBTCAddr(string memory addr) external;
    function updateFILAddr(string memory addr) external;
    function updateState(address addr) external  returns (uint8);
    function useCollateral(uint8 ccy,uint256 amt,address addr) external;
    function withdraw(uint256 amt) external;
}