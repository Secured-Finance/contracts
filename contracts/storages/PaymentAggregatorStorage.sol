// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../libraries/TimeSlot.sol";

library PaymentAggregatorStorage {
    using TimeSlot for TimeSlot.Slot;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.paymentAggregator");

    struct Storage {
        // Mapping structure for storing TimeSlots
        mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => TimeSlot.Slot))) timeSlots;
        mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => EnumerableSet.Bytes32Set))) deals;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
