// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import "../libraries/HitchensOrderStatisticsTreeLib.sol";

library OrderManagerStorage {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.orderManager");

    struct Storage {
        HitchensOrderStatisticsTreeLib.Tree historicalTakenLendOrders;
        HitchensOrderStatisticsTreeLib.Tree historicalTakenBorrowOrders;
        // Mapping from order date to rate
        mapping(uint256 => uint256) historicalExecutedLendRates;
        // Mapping from order date to rate
        mapping(uint256 => uint256) historicalExecutedBorrowRates;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
