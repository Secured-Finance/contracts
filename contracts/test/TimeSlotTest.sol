// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../libraries/TimeSlot.sol";
import "../libraries/AddressPacking.sol";
import "../libraries/BokkyPooBahsDateTimeLibrary.sol";
import "hardhat/console.sol";

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
        bytes32 addrPack,
        uint256 year,
        uint256 month,
        uint256 day
    ) external view returns (TimeSlot.Slot memory slot) {
        slot = TimeSlot.get(_timeSlots, addrPack, ccy, year, month, day);

        return slot;
    }

    function addPayment(
        bytes32 addrPack,
        bytes32 slot,
        uint256 payment0,
        uint256 payment1
    ) external {
        uint256 totalPaymentBefore0 = _timeSlots[addrPack][ccy][slot].totalPayment0;
        uint256 totalPaymentBefore1 = _timeSlots[addrPack][ccy][slot].totalPayment1;

        require(TimeSlot.addPayment(_timeSlots, addrPack, ccy, slot, payment0, payment1), "CAN'T ADD PAYMENT");

        require(_timeSlots[addrPack][ccy][slot].totalPayment0 == totalPaymentBefore0.add(payment0), "PAYMENT0 CHANGED INCORRECTLY");
        require(_timeSlots[addrPack][ccy][slot].totalPayment1 == totalPaymentBefore1.add(payment1), "PAYMENT1 CHANGED INCORRECTLY");
    }

    function removePayment(
        bytes32 addrPack,
        bytes32 slot,
        uint256 payment0,
        uint256 payment1
    ) external {
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];
        uint256 totalPaymentBefore0 = timeSlot.totalPayment0;
        uint256 totalPaymentBefore1 = timeSlot.totalPayment1;

        require(TimeSlot.removePayment(_timeSlots, addrPack, ccy, slot, payment0, payment1), "CAN'T REMOVE PAYMENT");

        timeSlot = _timeSlots[addrPack][ccy][slot];

        require(timeSlot.totalPayment0 == totalPaymentBefore0.sub(payment0), "PAYMENT0 REMOVED INCORRECTLY");
        require(timeSlot.totalPayment1 == totalPaymentBefore1.sub(payment1), "PAYMENT1 REMOVED INCORRECTLY");
    }

    function verifyPayment(
        bytes32 addrPack,
        bytes32 slot,
        uint256 payment,
        bytes32 txHash
    ) external {
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];
        TimeSlot.verifyPayment(_timeSlots, addrPack, ccy, slot, payment, txHash);

        timeSlot = _timeSlots[addrPack][ccy][slot];

        require(timeSlot.verificationParty == msg.sender, "INCORRECT VERIFIER");
        require(timeSlot.paymentProof == txHash, "INCORRECT TxHash");
    }

    function settlePayment(
        bytes32 addrPack,
        bytes32 slot,
        uint256 payment,
        bytes32 txHash
    ) external {
        TimeSlot.Slot memory timeSlot = _timeSlots[addrPack][ccy][slot];
        TimeSlot.settlePayment(_timeSlots, addrPack, ccy, slot, payment, txHash);

        timeSlot = _timeSlots[addrPack][ccy][slot];
        
        require(timeSlot.isSettled, "PAYMENT NOT SETTLED");
        require(timeSlot.paymentProof == txHash, "INCORRECT TxHash");
    }

    function clear(bytes32 addrPack, bytes32 slot) public {
        TimeSlot.clear(_timeSlots, addrPack, ccy, slot);

        require(_timeSlots[addrPack][ccy][slot].totalPayment0 == 0, "PAYMENT NOT CLEARED");
        require(_timeSlots[addrPack][ccy][slot].totalPayment1 == 0, "PAYMENT NOT CLEARED");
    }

    function isSettled(bytes32 addrPack, bytes32 slot) external view returns (bool) {
        return TimeSlot.isSettled(_timeSlots, addrPack, ccy, slot);
    }

    function getGasCostOfIsSettled(bytes32 addrPack, bytes32 slot) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        TimeSlot.isSettled(_timeSlots, addrPack, ccy, slot);

        return gasBefore - gasleft();
    }

}