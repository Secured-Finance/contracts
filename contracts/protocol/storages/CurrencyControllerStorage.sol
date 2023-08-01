// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../dependencies/chainlink/AggregatorV3Interface.sol";
import "../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";

struct Currency {
    bool isSupported;
    string name;
}

library CurrencyControllerStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.currencyController");

    struct Storage {
        bytes32 baseCurrency;
        // Protocol currencies
        EnumerableSet.Bytes32Set currencies;
        mapping(bytes32 => uint256) haircuts;
        // Array of the price feeds
        mapping(bytes32 => AggregatorV3Interface[]) priceFeeds;
        // Total cached decimals of the price feeds
        mapping(bytes32 => uint8) decimalsCaches;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
