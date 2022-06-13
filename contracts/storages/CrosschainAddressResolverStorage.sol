// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library CrosschainAddressResolverStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.crosschainAddressResolver");

    struct Storage {
        // Mapping for storing user cross-chain addresses
        mapping(address => mapping(uint256 => string)) crosschainAddreses;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
