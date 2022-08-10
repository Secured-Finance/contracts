// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct MaturityRate {
    uint256 rate;
    uint256 compoundFactor;
    uint256 next;
    uint256 prev;
}

library GenesisValueTokenStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.genesisValueToken");

    struct Storage {
        bytes32 ccy;
        uint256 compoundFactor;
        mapping(address => int256) balances;
        uint256 totalLendingSupply;
        uint256 totalBorrowingSupply;
        // Mapping from maturity to rate
        mapping(uint256 => MaturityRate) maturityRates;
        // Mapping of fvToken address existence
        mapping(address => bool) fvTokens;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
