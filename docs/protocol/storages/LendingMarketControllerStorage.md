# Solidity API

## ObservationPeriodLog

```solidity
struct ObservationPeriodLog {
  uint256 totalAmount;
  uint256 totalFutureValue;
}
```

## LendingMarketControllerStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  uint256 marketBasePeriod;
  uint256 marketTerminationDate;
  mapping(bytes32 => int256) marketTerminationPrices;
  mapping(bytes32 => uint256) marketTerminationRatios;
  mapping(bytes32 => uint8[]) orderBookIdLists;
  mapping(bytes32 => address) lendingMarkets;
  mapping(bytes32 => address) futureValueVaults;
  mapping(bytes32 => uint256) minDebtUnitPrices;
  mapping(bytes32 => uint256) genesisDates;
  mapping(bytes32 => mapping(uint256 => uint8)) maturityOrderBookIds;
  mapping(bytes32 => mapping(address => struct EnumerableSet.UintSet)) usedMaturities;
  mapping(bytes32 => mapping(uint256 => struct ObservationPeriodLog)) observationPeriodLogs;
  mapping(bytes32 => mapping(uint256 => uint256)) estimatedAutoRollUnitPrice;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => bool) isRedeemed;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketControllerStorage.Storage r)
```

