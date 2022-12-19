// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library TokenVaultStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.tokenVault");

    struct Storage {
        // Currencies accepted as collateral
        EnumerableSet.Bytes32Set collateralCurrencies;
        // Mapping from currency name to token address
        mapping(bytes32 => address) tokenAddresses;
        // Mapping for used currency vaults per user.
        mapping(address => EnumerableSet.Bytes32Set) usedCurrencies;
        // Mapping for all deposits per users
        mapping(address => mapping(bytes32 => uint256)) depositAmounts;
        // Mapping from user to total escrowed amount per currency
        mapping(address => mapping(bytes32 => uint256)) escrowedAmount;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
