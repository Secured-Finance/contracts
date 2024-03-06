// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

library FutureValueVaultStorage {
    bytes32 internal constant STORAGE_SLOT =
        bytes32(uint256(keccak256("sf.storage.futureValueVault")) - 1);

    struct Storage {
        // Mapping from user to balances per order book id
        mapping(uint8 orderBookId => mapping(address user => int256 balance)) balances;
        // Maturity when the user receives the balance on the target order book
        // NOTE: Now maturities don't need to be sorted per user because the user can have only one balance per maturity.
        // However, this storage must be kept to be used as it is for backward compatibility due to contract upgrade limitations.
        mapping(uint8 orderBookId => mapping(address user => uint256 maturity)) balanceMaturities;
        // Total lending amount supplied per maturity
        mapping(uint256 maturity => uint256 amount) totalLendingSupplies;
        // Total borrowing amount supplied per maturity
        mapping(uint256 maturity => uint256 amount) totalBorrowingSupplies;
        // Total lending amount removed per maturity
        mapping(uint256 maturity => uint256 amount) removedLendingSupply;
        // Total borrowing amount removed per maturity
        mapping(uint256 maturity => uint256 amount) removedBorrowingSupply;
        // Mapping from user to tokenized balances per order book id
        // NOTE: This mapping data doesn't use maturity because this field was added after contract upgrades.
        mapping(uint8 orderBookId => uint256 balance) totalLockedBalances;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
