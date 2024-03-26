# Solidity API

## ERC20PermitUpgradeableStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(address => struct Counters.Counter) nonces;
}
```

### slot

```solidity
function slot() internal pure returns (struct ERC20PermitUpgradeableStorage.Storage r)
```

