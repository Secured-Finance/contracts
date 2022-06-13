// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library LendingMarketControllerStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketController");

    struct Storage {
        mapping(bytes32 => mapping(uint256 => address)) lendingMarkets;
        mapping(bytes32 => uint256[]) supportedTerms;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
