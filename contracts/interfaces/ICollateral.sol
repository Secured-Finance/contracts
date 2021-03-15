// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct ColBook {
    string id;
    address userAddrETH;
    bytes32 userAddrFIL;
    address userAddrUSDC;
    bytes32 colAddrFIL;
    address colAddrUSDC;
    uint256 colAmtETH;
    uint256 colAmtFIL;
    uint256 colAmtUSDC;
    uint256 colAmtFILValue;
    uint256 colAmtUSDCValue;
    uint256 inuseETH;
    uint256 inuseFIL;
    uint256 inuseUSDC;
    uint256 inuseFILValue;
    uint256 inuseUSDCValue;
    uint256 coverage;
    bool isAvailable;
    uint8 state; 
}

interface ICollateral {
    event ConfirmUpSizeFIL(address indexed addr, bytes32 indexed addrFIL, uint256 amt, bytes32 indexed txHash);
    event DelColBook(address indexed addr);
    event PartialLiquidation(address indexed borrower, address indexed lender, uint256 indexed amount, uint8 ccy);
    event RegisterFILCustodyAddr(address indexed addr);
    event RequestFILCustodyAddr(address indexed requester);
    event SetColBook(address indexed addr, string indexed id, bytes32 userAddrFIL, address userAddrUSDC);
    event UpSizeETH(address indexed addr);
    event UpSizeFIL(address indexed addr, uint256 amt, bytes32 txHash);
    event UpdateState(address indexed addr, uint8 prevState, uint8 currState);
    
    function setMarketAddr(address moneyAddr, address fxAddr) external;
    function setLoanAddr(address loanAddr) external;
    function setColBook(string memory id, bytes32 userAddrFIL, address userAddrUSDC) external payable;
    function useCollateral(uint8 ccy, uint256 amt, address addr) external;
    function isCovered(uint256 amt, uint8 ccy, address addr) external view returns (bool);
    function releaseCollateral(uint8 ccy, uint256 amt, address addr) external;
    function withdrawCollaretal(uint8 ccy, uint256 amt) external;
    function getCoverage(uint256 amt, address addr) external view returns (uint256);
    function addressToString(address _addr) external pure returns (string memory);
    function updateState(address addr) external returns (uint8);
    function updateAllState() external;
    function partialLiquidation(address borrower, address lender, uint256 amount, uint8 ccy) external;
    function completePartialLiquidation(address borrower) external;
    function liquiadtion(address borrower, uint256 amount) external;
    function upSizeETH() external payable;
    function upSizeFIL(uint256 amtFIL, bytes32 txHash) external;
    function confirmUpSizeFIL(address addr, bytes32 addrFIL, uint256 amtFIL, bytes32 txHash) external;
    function delColBook() external;
    function getOneBook(address addr) external view returns (ColBook memory);
    function getAllBooks() external view returns (ColBook[] memory);
    function getAllUsers() external view returns (address[] memory);
    function getColState(address addr) external view returns (uint8);
    function getFILETH() external view returns (uint256);
    function updateFILValue(address addr) external;
    function updateAllFILValue() external;
    function getETHUSDC() external view returns (uint256);
    function updateUSDCValue(address addr) external;
    function updateAllUSDCValue() external;
    function requestFILCustodyAddr() external;
    function registerFILCustodyAddr(bytes32 colAddrFIL, address addr) external;
    function getAllFILCustodyAddr() external view returns (bytes32[] memory);
    function getRandom(uint256 seed) external view returns (uint256);
    function getRandFILCustodyAddr(uint256 seed) external view returns (bytes32);
}
