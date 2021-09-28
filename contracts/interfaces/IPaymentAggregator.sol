// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface IPaymentAggregator {
    event RegisterPayment(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 payment0,
        uint256 payment1
    );
    event RemovePayment(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 payment0,
        uint256 payment1
    );
    event SettlePayment(
        address indexed verifier,
        address indexed counterparty,
        bytes32 ccy,
        bytes32 timeSlot,
        bytes32 txHash
    );
    event VerifyPayment(
        address indexed verifier,
        address indexed counterparty,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 payment,
        bytes32 txHash
    );

    function addPaymentAggregatorUser(address _user) external returns (bool);

    function isPaymentAggregatorUser(address _user)
        external
        view
        returns (bool);

    function owner() external view returns (address);

    function registerPayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint8 term,
        uint256 notional,
        uint256 rate0,
        uint256 rate1,
        bool repayment0,
        bool repayment1
    ) external;

    function removePaymentAggregatorUser(address _user) external returns (bool);

    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 startDate,
        uint8 term,
        uint256 notional,
        uint256 rate0,
        uint256 rate1,
        bool repayment0,
        bool repayment1
    ) external;

    function settlePayment(
        address verifier,
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        bytes32 txHash
    ) external;

    function verifyPayment(
        address verifier,
        address counterparty,
        bytes32 ccy,
        uint256 timestamp,
        uint256 payment,
        bytes32 txHash
    ) external;
}