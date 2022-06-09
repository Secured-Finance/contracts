// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../types/ProtocolTypes.sol";

library TermStructureStorage {
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.termStructure");

    struct Storage {
        mapping(uint256 => uint256) terms;
        mapping(bytes4 => mapping(bytes32 => EnumerableSet.UintSet)) termsForProductAndCcy;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
