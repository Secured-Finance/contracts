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
  mapping(bytes32 => address[]) lendingMarkets;
  mapping(bytes32 => mapping(address => address)) futureValueVaults;
  mapping(bytes32 => mapping(uint256 => address)) maturityLendingMarkets;
  mapping(bytes32 => uint256) genesisDates;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(bytes32 => mapping(address => struct EnumerableSet.UintSet)) usedMaturities;
  mapping(address => mapping(bytes32 => mapping(uint256 => bool))) activeOrderExistences;
  mapping(bytes32 => mapping(uint256 => struct ObservationPeriodLog)) observationPeriodLogs;
  mapping(bytes32 => mapping(uint256 => uint256)) estimatedAutoRollUnitPrice;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketControllerStorage.Storage r)
```

