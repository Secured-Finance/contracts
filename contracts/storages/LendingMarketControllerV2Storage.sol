// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library LendingMarketControllerV2Storage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketControllerV2");

    struct Storage {
        address lendingMarketProxy;
        address genesisValueTokenProxy;
        address futureValueTokenProxy;
        mapping(bytes32 => address[]) lendingMarkets;
        mapping(bytes32 => address) genesisValueTokens;
        uint256 basisDate;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
