// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library ProductAddressResolverStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.productAddressResolver");

    struct Storage {
        // Mapping for storing product contract addresses
        mapping(bytes4 => address) productContracts;
        mapping(bytes4 => address) controllerContracts;
        // Mapping from product contract address to prefix for product type
        mapping(address => bytes4) productPrefix;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
