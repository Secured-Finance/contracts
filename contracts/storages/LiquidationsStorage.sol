// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library LiquidationsStorage {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.liquidations");

    struct Storage {
        uint256 offset;
        EnumerableSet.AddressSet liquidationAgents;
        EnumerableSet.AddressSet linkedContracts;
        // Mapping structure for storing liquidation queue to bilateral position
        mapping(bytes32 => EnumerableSet.Bytes32Set) liquidationQueue;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
