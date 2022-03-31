// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct Slot {
    uint256 totalPayment0;
    uint256 totalPayment1;
    uint256 netPayment;
    bool flipped;
    bytes32 paymentProof;
    address verificationParty;
    bool isSettled;
}

interface IPaymentAggregator {
    event UpdateCloseOutNetting(
        address indexed prevContract,
        address indexed closeOutNetting
    );
    event UpdateMarkToMarket(
        address indexed prevContract,
        address indexed closeOutNetting
    );

    event RegisterPayment(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 year,
        uint256 month,
        uint256 day,
        uint256 payment0,
        uint256 payment1
    );
    event VerifyPayment(
        address indexed verifier,
        address indexed counterparty,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 year,
        uint256 month,
        uint256 day,
        uint256 payment,
        bytes32 txHash
    );
    event SettlePayment(
        address indexed verifier,
        address indexed counterparty,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 year,
        uint256 month,
        uint256 day,
        bytes32 txHash
    );
    event RemovePayment(
        address indexed party0,
        address indexed party1,
        bytes32 ccy,
        bytes32 timeSlot,
        uint256 year,
        uint256 month,
        uint256 day,
        uint256 payment0,
        uint256 payment1
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
        uint256[] memory timestamps,
        uint256[] memory payments0,
        uint256[] memory payments1
    ) external;

    function removePaymentAggregatorUser(address _user) external returns (bool);

    function removePayments(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 dealId,
        uint256[] calldata timestamps,
        uint256[] calldata payments0,
        uint256[] calldata payments1
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

    function getDealsFromSlot(
        address party0,
        address party1,
        bytes32 ccy,
        bytes32 slotPosition
    ) external view returns (bytes32[] memory);

    // function getTimeSlotByDate(
    //     address party0,
    //     address party1,
    //     bytes32 ccy,
    //     uint256 year,
    //     uint256 month,
    //     uint256 day
    // ) external view returns (Slot memory timeSlot);

    // function getTimeSlotBySlotId(
    //     address party0,
    //     address party1,
    //     bytes32 ccy,
    //     bytes32 slot
    // ) external view returns (Slot memory timeSlot);

    function settlementWindow() external view returns (uint256);
}