// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../libraries/TimeSlot.sol";
import "../libraries/AddressPacking.sol";

contract TimeSlotTest {
    using TimeSlot for TimeSlot.Slot;
    using SafeMath for uint256;

    mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) _timeSlots;
    bytes32 public ccy = "0xSampleCCY";

    function position(uint256 year, uint256 month, uint256 day) external pure returns (bytes32) {
        return TimeSlot.position(year, month, day);
    }

    function getGasCostOfPosition(uint256 year, uint256 month, uint256 day) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        TimeSlot.position(year, month, day);

        return gasBefore - gasleft();
    }

    function get(
        address party0,
        address party1,
        uint256 year,
        uint256 month,
        uint256 day
    ) external view returns (TimeSlot.Slot memory slot) {
        slot = TimeSlot.get(_timeSlots, party0, party1, ccy, year, month, day);

        return slot;
    }

    function addPayment(
        address party0,
        address party1,
        bytes32 slot,
        uint256 payment0,
        uint256 payment1
    ) external {
        (bytes32 addrPack, bool flipped) = AddressPacking.pack(party0, party1);
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];

        uint256 totalPaymentBefore0 = timeSlot.totalPayment0;
        uint256 totalPaymentBefore1 = timeSlot.totalPayment1;

        TimeSlot.addPayment(_timeSlots, party0, party1, ccy, slot, payment0, payment1);

        timeSlot = _timeSlots[addrPack][ccy][slot];

        if (flipped) {
            require(timeSlot.totalPayment0 == totalPaymentBefore0.add(payment1), "PAYMENT1 CHANGED INCORRECTLY");
            require(timeSlot.totalPayment1 == totalPaymentBefore1.add(payment0), "PAYMENT0 CHANGED INCORRECTLY");
        } else {
            require(timeSlot.totalPayment0 == totalPaymentBefore0.add(payment0), "PAYMENT0 CHANGED INCORRECTLY");
            require(timeSlot.totalPayment1 == totalPaymentBefore1.add(payment1), "PAYMENT1 CHANGED INCORRECTLY");
        }
    }

    function removePayment(
        address party0,
        address party1,
        bytes32 slot,
        uint256 payment0,
        uint256 payment1
    ) external {
        (bytes32 addrPack, bool flipped) = AddressPacking.pack(party0, party1);
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];
        require(!timeSlot.isSettled, "TIMESLOT SETTLED ALREADY");

        uint256 totalPaymentBefore0 = timeSlot.totalPayment0;
        uint256 totalPaymentBefore1 = timeSlot.totalPayment1;

        TimeSlot.removePayment(_timeSlots, party0, party1, ccy, slot, payment0, payment1);

        timeSlot = _timeSlots[addrPack][ccy][slot];

        if (flipped) {
            require(timeSlot.totalPayment0 == totalPaymentBefore0.sub(payment1), "PAYMENT1 REMOVED INCORRECTLY");
            require(timeSlot.totalPayment1 == totalPaymentBefore1.sub(payment0), "PAYMENT0 REMOVED INCORRECTLY");
        } else {
            require(timeSlot.totalPayment0 == totalPaymentBefore0.sub(payment0), "PAYMENT0 REMOVED INCORRECTLY");
            require(timeSlot.totalPayment1 == totalPaymentBefore1.sub(payment1), "PAYMENT1 REMOVED INCORRECTLY");
        }
    }

    function verifyPayment(
        address counterparty,
        bytes32 slot,
        uint256 payment,
        bytes32 txHash
    ) external {
        (bytes32 addrPack, ) = AddressPacking.pack(msg.sender, counterparty);
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];
        TimeSlot.verifyPayment(_timeSlots, msg.sender, counterparty, ccy, slot, payment, txHash);

        timeSlot = _timeSlots[addrPack][ccy][slot];

        require(timeSlot.verificationParty == msg.sender, "INCORRECT VERIFIER");
        require(timeSlot.paymentProof == txHash, "INCORRECT TxHash");
    }

    function settlePayment(
        address counterparty,
        bytes32 slot,
        bytes32 txHash
    ) external {
        (bytes32 addrPack, ) = AddressPacking.pack(msg.sender, counterparty);
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];
        TimeSlot.settlePayment(_timeSlots, msg.sender, counterparty, ccy, slot, txHash);

        timeSlot = _timeSlots[addrPack][ccy][slot];
        
        require(timeSlot.isSettled, "PAYMENT NOT SETTLED");
        require(timeSlot.paymentProof == txHash, "INCORRECT TxHash");
    }

    function clear(
        address party0,
        address party1,
        bytes32 slot
    ) public {
        (bytes32 addrPack, ) = AddressPacking.pack(party0, party1);
        TimeSlot.clear(_timeSlots, party0, party1, ccy, slot);

        require(_timeSlots[addrPack][ccy][slot].totalPayment0 == 0, "PAYMENT NOT CLEARED");
        require(_timeSlots[addrPack][ccy][slot].totalPayment1 == 0, "PAYMENT NOT CLEARED");
    }

    function isSettled(
        address party0,
        address party1,
        bytes32 slot
    ) external view returns (bool) {
        return TimeSlot.isSettled(_timeSlots, party0, party1, ccy, slot);
    }

    function getGasCostOfIsSettled(
        address party0,
        address party1, 
        bytes32 slot
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        TimeSlot.isSettled(_timeSlots, party0, party1, ccy, slot);

        return gasBefore - gasleft();
    }

}