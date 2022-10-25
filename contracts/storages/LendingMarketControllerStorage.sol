// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library LendingMarketControllerStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketController");

    struct Storage {
        // Mapping from currency to lending market contract addresses
        mapping(bytes32 => address[]) lendingMarkets;
        // Mapping from lending market contract address to future value contract address per currency
        mapping(bytes32 => mapping(address => address)) futureValues;
        // Mapping from maturity to lending market contract address per currency
        mapping(bytes32 => mapping(uint256 => address)) maturityLendingMarkets;
        // Mapping from currency to basis date in the lending market
        mapping(bytes32 => uint256) basisDates;
        // Mapping from user to used currency
        mapping(address => EnumerableSet.Bytes32Set) usedCurrencies;
        // Mapping from user to used currency
        mapping(address => EnumerableSet.Bytes32Set) exposedCurrencies;
        // Mapping from user to active order existence per currency and maturity
        mapping(address => mapping(bytes32 => mapping(uint256 => bool))) activeOrderExistences;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
