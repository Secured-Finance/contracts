// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library FutureValueStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.futureValue");

    struct Storage {
        uint256 maturity;
        // Mapping from user to balances
        mapping(address => int256) balances;
        // Mapping from user to maturity
        mapping(address => uint256) futureValueMaturities;
        // Mapping from maturity to total amount supplied of lending
        mapping(uint256 => uint256) totalLendingSupply;
        // Mapping from maturity to total amount supplied of borrowing
        mapping(uint256 => uint256) totalBorrowingSupply;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
