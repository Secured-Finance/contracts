# Solidity API

## CollateralAggregatorStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(address => mapping(bytes32 => uint256)) unsettledCollateral;
  mapping(address => struct EnumerableSet.Bytes32Set) exposedUnsettledCurrencies;
  mapping(address => bool) isRegistered;
}
```

### slot

```solidity
function slot() internal pure returns (struct CollateralAggregatorStorage.Storage r)
```

