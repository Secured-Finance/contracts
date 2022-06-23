// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "../libraries/CloseOut.sol";

library CloseOutNettingStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.closeOutNetting");

    struct Storage {
        // Mapping structure for storing Close Out payments
        mapping(bytes32 => mapping(bytes32 => CloseOut.Payment)) closeOuts;
        // Mapping structure for storing default boolean per address
        mapping(address => bool) isDefaulted;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
