// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct MaturityUnitPrice {
    uint256 unitPrice;
    uint256 compoundFactor;
    uint256 next;
    uint256 prev;
}

library GenesisValueVaultStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.genesisValueVault");

    struct Storage {
        mapping(bytes32 => bool) isRegisteredCurrency;
        mapping(bytes32 => uint256) initialCompoundFactors;
        mapping(bytes32 => uint256) compoundFactors;
        mapping(bytes32 => uint256) currentMaturity;
        mapping(bytes32 => uint8) decimals;
        // Mapping from user to balance per currency
        mapping(bytes32 => mapping(address => int256)) balances;
        mapping(bytes32 => uint256) totalLendingSupplies;
        mapping(bytes32 => uint256) totalBorrowingSupplies;
        // Mapping from maturity to rate per currency
        mapping(bytes32 => mapping(uint256 => MaturityUnitPrice)) maturityUnitPrices;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}