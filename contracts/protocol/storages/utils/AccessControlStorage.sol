// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

struct RoleData {
    mapping(address => bool) members;
    bytes32 adminRole;
}

library AccessControlStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.accessControl");

    struct Storage {
        mapping(bytes32 role => RoleData roleData) roles;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
