// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library CollateralAggregatorStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralAggregator");

    struct Storage {
        // Mapping from user to total unsettled collateral per currency
        mapping(address => mapping(bytes32 => uint256)) unsettledCollateral;
        // Mapping from user to unsettled exposure
        mapping(address => EnumerableSet.Bytes32Set) exposedUnsettledCurrencies;
        // Mapping for all registered users
        mapping(address => bool) isRegistered;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
