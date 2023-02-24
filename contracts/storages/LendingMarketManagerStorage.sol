// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library LendingMarketManagerStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketManager");

    struct Storage {
        // Mapping from currency to order fee rate received by protocol (in basis point)
        mapping(bytes32 => uint256) orderFeeRates;
        // Mapping from currency to auto-roll fee rate received by protocol (in basis point)
        mapping(bytes32 => uint256) autoRollFeeRates;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
