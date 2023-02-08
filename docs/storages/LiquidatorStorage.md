# Solidity API

## LiquidatorStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(address => uint256) liquidators;
}
```

### slot

```solidity
function slot() internal pure returns (struct LiquidatorStorage.Storage r)
```

