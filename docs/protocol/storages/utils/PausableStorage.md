# Solidity API

## PausableStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  bool paused;
}
```

### slot

```solidity
function slot() internal pure returns (struct PausableStorage.Storage r)
```

