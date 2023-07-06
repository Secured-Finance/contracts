// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {OrderStatisticsTreeLib} from "../libraries/OrderStatisticsTreeLib.sol";

struct MarketOrder {
    ProtocolTypes.Side side;
    uint256 unitPrice; // in basis points
    uint256 maturity;
    uint256 timestamp;
}

struct ItayoseLog {
    uint256 openingUnitPrice;
    uint256 lastLendUnitPrice;
    uint256 lastBorrowUnitPrice;
}

library LendingMarketStorage {
    using OrderStatisticsTreeLib for OrderStatisticsTreeLib.Tree;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarket");

    struct Storage {
        bytes32 ccy;
        uint48 lastOrderId;
        uint256 openingDate;
        uint256 maturity;
        // Mapping from maturity to boolean if the market is ready or not
        mapping(uint256 => bool) isReady;
        // Mapping from user to active lend order ids
        mapping(address => uint48[]) activeLendOrderIds;
        // Mapping from user to active borrow order ids
        mapping(address => uint48[]) activeBorrowOrderIds;
        // Mapping from user to current maturity
        mapping(address => uint256) userCurrentMaturities;
        // Mapping from orderId to order
        mapping(uint256 => MarketOrder) orders;
        // Mapping from orderId to boolean for pre-order or not
        mapping(uint256 => bool) isPreOrder;
        // Mapping from maturity to lending orders
        mapping(uint256 => OrderStatisticsTreeLib.Tree) lendOrders;
        // Mapping from maturity to borrowing orders
        mapping(uint256 => OrderStatisticsTreeLib.Tree) borrowOrders;
        // Mapping from order side to threshold unit price of circuit breaker per block
        mapping(uint256 => mapping(ProtocolTypes.Side => uint256)) circuitBreakerThresholdUnitPrices;
        // Mapping from maturity to Itayose log
        mapping(uint256 => ItayoseLog) itayoseLogs;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
