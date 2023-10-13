// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library FutureValueVaultStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.futureValueVault");

    struct Storage {
        // Mapping from user to balances per order book id
        mapping(uint8 orderBookId => mapping(address user => int256 balance)) balances;
        // Maturity when the user receives the balance on the target order book
        mapping(uint8 orderBookId => mapping(address user => uint256 maturity)) balanceMaturities;
        // Total amount supplied per maturity
        mapping(uint256 maturity => uint256 amount) totalSupply;
        // Total lending amount removed per maturity
        mapping(uint256 maturity => uint256 amount) removedLendingSupply;
        // Total borrowing amount removed per maturity
        mapping(uint256 maturity => uint256 amount) removedBorrowingSupply;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
