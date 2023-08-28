// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";

struct ObservationPeriodLog {
    uint256 totalAmount;
    uint256 totalFutureValue;
}

library LendingMarketControllerStorage {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 internal constant STORAGE_SLOT = keccak256("sf.storage.lendingMarketController");

    struct Storage {
        uint256 marketBasePeriod;
        uint256 marketTerminationDate;
        mapping(bytes32 => int256) marketTerminationPrices;
        mapping(bytes32 => uint256) marketTerminationRatios;
        // Mapping from currency to order book id list
        mapping(bytes32 => uint8[]) orderBookIdLists;
        // Mapping from currency to lending market contract address
        mapping(bytes32 => address) lendingMarkets;
        // Mapping from currency to future value vault contract address
        mapping(bytes32 => address) futureValueVaults;
        // Mapping from maturity to order book id per currency
        mapping(bytes32 => mapping(uint256 => uint8)) maturityOrderBookIds;
        // Mapping from currency to genesis date in the lending market
        mapping(bytes32 => uint256) genesisDates;
        // Mapping from user to used currency
        mapping(address => EnumerableSet.Bytes32Set) usedCurrencies;
        // Mapping from user to used market maturity per currency
        mapping(bytes32 => mapping(address => EnumerableSet.UintSet)) usedMaturities;
        // Mapping from maturity to observation period log per currency
        mapping(bytes32 => mapping(uint256 => ObservationPeriodLog)) observationPeriodLogs;
        // Mapping from maturity to latest estimated auto roll unit price per currency
        mapping(bytes32 => mapping(uint256 => uint256)) estimatedAutoRollUnitPrice;
        // Mapping from user to redeemed flag
        mapping(address => bool) isRedeemed;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
