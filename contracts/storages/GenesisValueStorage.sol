// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct MaturityRate {
    uint256 rate;
    uint256 tenor;
    uint256 compoundFactor;
    uint256 next;
    uint256 prev;
}

library GenesisValueStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.genesisValue");

    struct Storage {
        mapping(bytes32 => bool) isRegisteredCurrency;
        mapping(bytes32 => uint256) initialCompoundFactors;
        mapping(bytes32 => uint256) compoundFactors;
        mapping(bytes32 => uint8) decimals;
        mapping(bytes32 => mapping(address => int256)) balances;
        mapping(bytes32 => uint256) totalLendingSupplies;
        mapping(bytes32 => uint256) totalBorrowingSupplies;
        // Mapping from maturity to rate per currency
        mapping(bytes32 => mapping(uint256 => MaturityRate)) maturityRates;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
