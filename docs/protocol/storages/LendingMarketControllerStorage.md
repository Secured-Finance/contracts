# Solidity API

## ObservationPeriodLog

```solidity
struct ObservationPeriodLog {
  uint256 totalAmount;
  uint256 totalFutureValue;
}
```

## TerminationCurrencyCache

```solidity
struct TerminationCurrencyCache {
  int256 price;
  uint8 decimals;
}
```

## ZCTokenInfo

```solidity
struct ZCTokenInfo {
  bytes32 ccy;
  uint256 maturity;
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
  uint256 terminationDate;
  mapping(bytes32 => struct TerminationCurrencyCache) terminationCurrencyCaches;
  mapping(bytes32 => uint256) terminationCollateralRatios;
  mapping(bytes32 => uint8[]) orderBookIdLists;
  mapping(bytes32 => address) lendingMarkets;
  mapping(bytes32 => address) futureValueVaults;
  mapping(bytes32 => uint256) minDebtUnitPrices;
  mapping(bytes32 => uint256) genesisDates;
  mapping(bytes32 => mapping(uint256 => uint256)) pendingOrderAmounts;
  mapping(bytes32 => mapping(uint256 => uint8)) maturityOrderBookIds;
  mapping(bytes32 => mapping(address => struct EnumerableSet.UintSet)) usedMaturities;
  mapping(bytes32 => mapping(uint256 => struct ObservationPeriodLog)) observationPeriodLogs;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => bool) isRedeemed;
  mapping(bytes32 => mapping(uint256 => address)) zcTokens;
  mapping(address => struct ZCTokenInfo) zcTokenInfo;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketControllerStorage.Storage r)
```

