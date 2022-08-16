// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library FutureValueStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.futureValue");

    struct Storage {
        bytes32 ccy;
        uint256 marketNo;
        uint256 maturity;
        mapping(address => int256) balances;
        mapping(address => uint256) balanceMaturities;
        mapping(uint256 => uint256) totalLendingSupply;
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
