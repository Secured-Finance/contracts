// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

library FutureValueVaultStorage {
    bytes32 internal constant STORAGE_SLOT =
        bytes32(uint256(keccak256("sf.storage.futureValueVault")) - 1);

    struct Storage {
        // Mapping from user to balances per maturity
        mapping(uint256 maturity => mapping(address user => int256 balance)) balances;
        // Total lending amount supplied per maturity
        mapping(uint256 maturity => uint256 amount) totalLendingSupplies;
        // Total borrowing amount supplied per maturity
        mapping(uint256 maturity => uint256 amount) totalBorrowingSupplies;
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
