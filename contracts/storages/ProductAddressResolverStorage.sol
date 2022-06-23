// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library ProductAddressResolverStorage {
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.productAddressResolver");

    struct Storage {
        // Mapping from prefix to product contract address
        mapping(bytes4 => address) productContracts;
        // Mapping from prefix to controller contract address
        mapping(bytes4 => address) controllerContracts;
        // Mapping from product contract address to prefix for product type
        mapping(address => bytes4) productPrefix;
        // Registered product addresses
        EnumerableSet.AddressSet productAddresses;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
