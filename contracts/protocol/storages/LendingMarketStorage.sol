// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {OrderStatisticsTreeLib} from "../libraries/OrderStatisticsTreeLib.sol";
import {OrderBookLib} from "../libraries/OrderBookLib.sol";

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
        uint8 lastOrderBookId;
        // Order fee rate received by protocol (in basis point)
        uint256 orderFeeRate;
        // Rate limit range of yield for the circuit breaker
        uint256 circuitBreakerLimitRange;
        // Mapping from order book id to order book
        mapping(uint8 => OrderBookLib.OrderBook) orderBooks;
        // Mapping from maturity to boolean if the market is ready or not per maturity
        mapping(uint256 => bool) isReady;
        // // Mapping from maturity to Itayose log
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
