# Solidity API

## LendingMarketManagerStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => uint256) orderFeeRates;
  mapping(bytes32 => uint256) autoRollFeeRates;
  uint256 observationPeriod;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketManagerStorage.Storage r)
```

