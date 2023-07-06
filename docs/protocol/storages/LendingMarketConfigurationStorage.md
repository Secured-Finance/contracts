# Solidity API

## LendingMarketConfigurationStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => uint256) orderFeeRates;
  mapping(bytes32 => uint256) circuitBreakerLimitRanges;
  uint256 observationPeriod;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketConfigurationStorage.Storage r)
```

