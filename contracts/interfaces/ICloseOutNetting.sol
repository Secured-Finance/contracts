// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface ICloseOutNetting {
    event AddCloseOutPayments(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    );
    event RemoveCloseOutPayments(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    );
    event SettleCloseOut(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        uint256 netPayment,
        bytes32 txHash
    );
    event VerifyCloseOut(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        uint256 netPayment,
        bytes32 txHash
    );

    function addPayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) external;

    function checkDefault(address _party) external view returns (bool);

    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        uint256 payment0,
        uint256 payment1
    ) external;
}
