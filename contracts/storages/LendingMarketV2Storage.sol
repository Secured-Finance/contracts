// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import "../interfaces/IFutureValueToken.sol";
import "../interfaces/IGenesisValueToken.sol";
import "../libraries/HitchensOrderStatisticsTreeLib.sol";

struct MarketOrder {
    ProtocolTypes.Side side;
    uint256 amount;
    uint256 rate; // in basis points
    address maker;
    uint256 maturity;
}

library LendingMarketV2Storage {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketV2Storage");

    struct Storage {
        uint256 lastOrderId;
        bytes32 ccy;
        uint256 marketNo;
        uint256 basisDate;
        uint256 maturity;
        IFutureValueToken fvToken;
        IGenesisValueToken gvToken;
        // Mapping from maturity to rate
        mapping(uint256 => MarketOrder) orders;
        mapping(uint256 => HitchensOrderStatisticsTreeLib.Tree) lendOrders;
        mapping(uint256 => HitchensOrderStatisticsTreeLib.Tree) borrowOrders;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
