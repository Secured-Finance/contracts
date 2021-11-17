// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./BokkyPooBahsDateTimeLibrary.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

library TimeSlot {
    using BokkyPooBahsDateTimeLibrary for uint256;
    using SafeMath for uint256;

    /**
    * @dev Slot keeps track of total payments to be settled per one day
    * by two counterparties per currency, net payment and 
    * an indicator if parties obligations are flipped
    */
    struct Slot {
        uint256 totalPayment0;
        uint256 totalPayment1;
        uint256 netPayment;
        bool flipped;
        bytes32 paymentProof;
        address verificationParty;
        bool isSettled;
    }

    /**
    * @dev Computes the time slot position in the mapping by preconfigured time
    * @param year Year in which to find a timeslot
    * @param month Month in which to find a timeslot
    * @param day Day in which to find a timeslot    
    */
    function position(uint256 year, uint256 month, uint256 day) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(year, month, day));
    }

    /**
    * @dev Returns the time slot information from the mapping and preconfigured time
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param year Year in which to find a timeslot
    * @param month Month in which to find a timeslot
    * @param day Day in which to find a timeslot    
    */
    function get(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        uint256 year,
        uint256 month,
        uint256 day
    ) internal view returns (TimeSlot.Slot memory) {
        return getBySlotId(self, addr, ccy, keccak256(abi.encodePacked(year, month, day)));
    }

    /**
    * @dev Returns the time slot information from the mapping
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slotId Time slot identifier
    */
    function getBySlotId(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slotId
    ) internal view returns (TimeSlot.Slot memory) {
        TimeSlot.Slot memory timeSlot = self[addr][ccy][slotId];

        if (timeSlot.totalPayment1 > timeSlot.totalPayment0) { // if Alice is party1, Bob is party0
            timeSlot.netPayment = timeSlot.totalPayment1.sub(timeSlot.totalPayment0);
            timeSlot.flipped = true;
        } else {
            timeSlot.netPayment = timeSlot.totalPayment0.sub(timeSlot.totalPayment1);
            timeSlot.flipped = false;
        }

        return timeSlot;
    }

    /** 
    * @dev Adds payment into the time slot with provided information
    * @param self The mapping with all time slots
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slot Time slot identifier to be updated
    * @param payment0 Payment obligated to the first counterparty
    * @param payment1 Payment obligated to the second counterparty
    */
    function addPayment(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slot,
        uint256 payment0,
        uint256 payment1
    ) internal {
        TimeSlot.Slot storage timeSlot = self[addr][ccy][slot];
        require (!timeSlot.isSettled, "TIMESLOT SETTLED ALREADY");

        timeSlot.totalPayment0 = timeSlot.totalPayment0.add(payment0);
        timeSlot.totalPayment1 = timeSlot.totalPayment1.add(payment1);
    }

    /** 
    * @dev Removes payment from the time slot with provided information
    * @param self The mapping with all time slots
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slot Time slot identifier to be updated
    * @param payment0 Payment amount to remove for the first counterparty
    * @param payment1 Payment amount to remove for the second counterparty
    */
    function removePayment(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slot,
        uint256 payment0,
        uint256 payment1
    ) internal {
        TimeSlot.Slot storage timeSlot = self[addr][ccy][slot];
        if (timeSlot.isSettled) return;

        timeSlot.totalPayment0 = timeSlot.totalPayment0.sub(payment0);
        timeSlot.totalPayment1 = timeSlot.totalPayment1.sub(payment1);
    }

    /** 
    * @dev Verifies the net payment for time slot
    * @param self The mapping with all time slots
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slot Time slot identifier to be verified
    * @param payment Net payment amount
    * @param txHash Transaction hash to signal successfull payment
    */
    function verifyPayment(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slot,
        uint256 payment,
        bytes32 txHash,
        address verifier
    ) internal {
        TimeSlot.Slot storage timeSlot = self[addr][ccy][slot];
        // TODO: Add counterparty checks based on flipped status of the time slot
        require (!timeSlot.isSettled, "TIMESLOT SETTLED ALREADY");
        uint256 netPayment;

        if (timeSlot.totalPayment0 > timeSlot.totalPayment1) {
            netPayment = timeSlot.totalPayment0.sub(timeSlot.totalPayment1);
        } else {
            netPayment = timeSlot.totalPayment1.sub(timeSlot.totalPayment0);
        }
        require (netPayment == payment, "Incorrect settlement amount");
        timeSlot.paymentProof = txHash;
        timeSlot.verificationParty = verifier;
    }

    /** 
    * @dev Settles the net payment for time slot
    * @param self The mapping with all time slots
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slot Time slot identifier to be settled
    * @param txHash Transaction hash to signal successfull settlement of payment
    */
    function settlePayment(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slot,
        bytes32 txHash,
        address verifier
    ) internal {
        TimeSlot.Slot storage timeSlot = self[addr][ccy][slot];
        require (!timeSlot.isSettled, "TIMESLOT SETTLED ALREADY");
        require (timeSlot.paymentProof == txHash, "INCORRECT_TX_HASH");
        require(verifier != timeSlot.verificationParty, "INCORRECT_COUNTERPARTY");
        timeSlot.isSettled = true;
    }

    /** 
    * @dev Clears the time slot, triggered only when the timeslot has empty payments for both parties and 0 net payment
    * @param self The mapping with all time slots
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slot TimeSlot identifier to be cleared
    */
    function clear(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slot
    ) internal {
        delete self[addr][ccy][slot];
    }

    /** 
    * @dev Verifies if TimeSlot was settled
    * @param self The mapping with all time slots
    * @param addr Packed addresses for counterparties
    * @param ccy Main currency for the time slot
    * @param slot TimeSlot identifier to be cleared
    * @return Boolean of settlement status
    */
    function isSettled(
        mapping(bytes32 => mapping(bytes32 => mapping (bytes32 => TimeSlot.Slot))) storage self,
        bytes32 addr,
        bytes32 ccy,
        bytes32 slot
    ) internal view returns (bool) {
        return self[addr][ccy][slot].isSettled;
    }

}