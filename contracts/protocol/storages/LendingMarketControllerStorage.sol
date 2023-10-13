// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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
        mapping(bytes32 ccy => int256 price) marketTerminationPrices;
        mapping(bytes32 ccy => uint256 ratio) marketTerminationRatios;
        mapping(bytes32 ccy => uint8[] orderBookIds) orderBookIdLists;
        mapping(bytes32 ccy => address lendingMarket) lendingMarkets;
        mapping(bytes32 ccy => address futureValueVault) futureValueVaults;
        mapping(bytes32 ccy => uint256 unitPrice) minDebtUnitPrices;
        mapping(bytes32 ccy => uint256 genesisDate) genesisDates;
        // Order book id history to get order book id from maturity
        mapping(bytes32 ccy => mapping(uint256 maturity => uint8 orderBookIds)) maturityOrderBookIds;
        // List of maturity that the user has open orders or positions
        mapping(bytes32 ccy => mapping(address user => EnumerableSet.UintSet maturities)) usedMaturities;
        // Observation period logs that is used for auto-rolls
        mapping(bytes32 ccy => mapping(uint256 maturity => ObservationPeriodLog log)) observationPeriodLogs;
        mapping(bytes32 ccy => mapping(uint256 maturity => uint256 unitPrice)) estimatedAutoRollUnitPrice;
        // List of currency that the user has open orders or positions
        mapping(address user => EnumerableSet.Bytes32Set currency) usedCurrencies;
        mapping(address user => bool isRedeemed) isRedeemed;
    }

    function slot() internal pure returns (Storage storage r) {
        bytes32 _slot = STORAGE_SLOT;
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _slot
        }
    }
}
