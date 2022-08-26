// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library CollateralAggregatorStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.collateralAggregator");

    struct Storage {
        // Mapping for total amount of collateral locked against independent collateral from all books.
        mapping(address => mapping(bytes32 => uint256)) unsettledCollateral;
        // Mapping for used currencies in unsettled exposures.
        mapping(address => EnumerableSet.Bytes32Set) exposedUnsettledCurrencies;
        // Mapping for all registered users.
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
