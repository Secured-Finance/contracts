// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";
import "../libraries/HitchensOrderStatisticsTreeLib.sol";

struct MarketOrder {
    ProtocolTypes.Side side;
    uint256 rate; // in basis points
    uint256 maturity;
    uint256 timestamp;
}

library LendingMarketStorage {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarket");

    struct Storage {
        uint48 lastOrderId;
        bytes32 ccy;
        uint256 basisDate;
        uint256 maturity;
        // Mapping from user to active lend order ids
        mapping(address => uint48[]) activeLendOrderIds;
        // Mapping from user to active borrow order ids
        mapping(address => uint48[]) activeBorrowOrderIds;
        // Mapping from orderId to order
        mapping(uint256 => MarketOrder) orders;
        // Mapping from maturity to lending orders
        mapping(uint256 => HitchensOrderStatisticsTreeLib.Tree) lendOrders;
        // Mapping from maturity to borrowing orders
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
