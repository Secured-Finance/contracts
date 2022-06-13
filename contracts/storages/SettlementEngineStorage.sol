// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";

library SettlementEngineStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.settlementEngine");

    struct Storage {
        // Mapping to external providers addresses by Chain Ids
        // for ETH-based currencies there is no need for external adapters
        mapping(uint16 => address) externalAdapters;
        // Mapping of cross-chain settlement requests per requestId
        mapping(bytes32 => ProtocolTypes.SettlementRequest) settlementRequests;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
