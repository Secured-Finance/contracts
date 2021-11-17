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
        bytes32 dealId,
        uint256[6] memory timestamps,
        uint256[6] memory payments0,
        uint256[6] memory payments1
    ) external;

    function removePaymentAggregatorUser(address _user) external returns (bool);

    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 dealId,
        uint256[6] calldata timestamps,
        uint256[6] calldata payments0,
        uint256[6] calldata payments1
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

    function isSettled(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 timestamp
    ) external view returns (bool status);
}