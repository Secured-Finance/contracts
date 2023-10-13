// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../dependencies/chainlink/AggregatorV3Interface.sol";
import "../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";

struct PriceFeed {
    AggregatorV3Interface[] instances;
    uint256 heartbeat;
}

library CurrencyControllerStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.currencyController");

    struct Storage {
        // Protocol currencies
        EnumerableSet.Bytes32Set currencies;
        mapping(bytes32 ccy => uint256 haircut) haircuts;
        // Total cached decimals of the price feeds
        mapping(bytes32 ccy => uint8 decimals) decimalsCaches;
        mapping(bytes32 ccy => PriceFeed priceFeed) priceFeeds;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
