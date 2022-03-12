// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct LoanDeal {
    address lender;
    address borrower;
    bytes32 ccy;
    uint256 term;
    uint256 notional;
    uint256 rate;
    uint256 start;
    uint256 end;
    uint256 pv;
    bytes32 startTxHash;
    uint8 state;
}

interface ILoanV2 {
    event EarlyTermination(
        bytes32 dealId,
        address indexed acceptedBy,
        uint256 payment
    );
    event Liquidate(bytes32 dealId);
    event MarkToMarket(bytes32 dealId, uint256 prevPV, uint256 currPV);
    event Novation(bytes32 indexed dealId, address currLender);
    event Register(
        address indexed lender,
        address indexed borrower,
        bytes32 ccy,
        uint256 term,
        uint256 notional,
        uint256 rate,
        bytes32 indexed dealId
    );
    event RejectTermination(bytes32 dealId, address indexed rejectedBy);
    event RequestTermination(bytes32 dealId, address indexed requestedBy);

    function acceptTermination(bytes32 loanId) external;

    function addLendingMarket(
        bytes32 _ccy,
        uint256 _term,
        address addr
    ) external;

    function getDF(bytes32 loanId, uint256 date)
        external
        view
        returns (uint256);

    function getDealPV(bytes32 loanId) external view returns (uint256 pv);

    function getDealLastPV(
        address party0,
        address party1,
        bytes32 loanId
    ) external view returns (uint256, uint256);

    function getDealSettlementStatus(bytes32 loanId)
        external
        view
        returns (bool);

    function getLastSettledPayment(bytes32 loanId)
        external
        view
        returns (uint256);

    function getLoanDeal(bytes32 loanId)
        external
        view
        returns (LoanDeal memory);

    function getPaymentSchedule(bytes32 loanId)
        external
        view
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        );

    function getVersion() external view returns (uint16);

    function isTransferable() external view returns (bool);

    function last_loan_id() external view returns (uint256);

    function lendingMarkets(bytes32, uint256) external view returns (address);

    function liquidate(bytes32 loanId) external;

    function markToMarket(bytes32 loanId) external returns (bool);

    function novation(bytes32 loanId, address newOwner) external;

    function owner() external view returns (address);

    function register(
        address maker,
        address taker,
        uint8 side,
        bytes32 ccy,
        uint256 term,
        uint256 notional,
        uint256 rate
    ) external returns (bytes32 loanId);

    function rejectTermination(bytes32 loanId) external;

    function requestTermination(bytes32 loanId) external;

    function setCollateralAddr(address addr) external;

    function setIsTransferable(bool isAccepted) external;

    function setLendingControllerAddr(address addr) external;

    function setPaymentAggregator(address addr) external;
}
