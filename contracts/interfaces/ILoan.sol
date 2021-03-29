// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct Schedule { 
    uint256[5] notices;
    uint256[5] payments;
    uint256[5] amounts;
    bool[5] isDone;
    bytes32[5] txHash; 
}

struct LoanItem { 
    uint256 loanId;
    address lender;
    address borrower;
    uint8 side;
    uint8 ccy;
    uint8 term;
    uint256 amt;
    uint256 rate;
    uint256 start;
    uint256 end;
    Schedule schedule;
    uint256 pv;
    uint256 asOf;
    bool isAvailable;
    bytes32 startTxHash;
    uint8 state; 
}

struct LoanBook { 
    LoanItem[] loans;
    uint256 loanNum;
    bool isValue; 
}

interface ILoan {
    event ConfirmPayment(address indexed lender, address indexed borrower, uint8 side, uint8 ccy, uint256 term, uint256 amt, uint256 loanId, bytes32 indexed txHash);
    event MakeLoanDeal(address indexed makerAddr, uint8 indexed side, uint8 ccy, uint8 term, uint256 amt, uint256 rate, uint256 indexed loanId);
    event NotifyPayment(address indexed lender, address indexed borrower, uint8 side, uint8 ccy, uint256 term, uint256 amt, uint256 loanId, bytes32 indexed txHash);
    event UpdateState(address indexed lender, address indexed borrower, uint256 indexed loanId, uint8 prevState, uint8 currState);
    
    function owner() external view returns (address);
    function setLendingControllerAddr(address addr) external;
    function makeLoanDeal(address makerAddr, uint8 side, uint8 ccy, uint8 term, uint256 amt) external;
    function fillSchedule(Schedule memory schedule, uint8 term, uint256 amt, uint256 rate) external view;
    function getLoanItem(uint256 loanId) external view returns (LoanItem memory);
    function getOneBook(address addr) external view returns (LoanBook memory);
    function getLenderBook(address lender) external view returns (LoanBook memory);
    function getBorrowerBook(address borrower) external view returns (LoanBook memory);
    function getAllBooks() external view returns (LoanBook[] memory);
    function getAllLenders() external view returns (address[] memory);
    function getAllBorrowers() external view returns (address[] memory);
    function getCurrentState(Schedule memory schedule) external view returns (uint8);
    function updateState(address lender, address borrower, uint256 loanId) external;
    function updateAllState() external;
    function notifyPayment(address lender, address borrower, uint8 side, uint8 ccy, uint256 term, uint256 amt, uint256 loanId, bytes32 txHash) external;
    function confirmPayment(address lender, address borrower, uint8 side, uint8 ccy, uint256 term, uint256 amt, uint256 loanId, bytes32 txHash) external;
    function updateAllPV() external;
    function updateBookPV(address lender) external;
}