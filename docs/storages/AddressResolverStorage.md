# Solidity API

## AddressResolverStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => address) addresses;
  address[] addressCaches;
}
```

### slot

```solidity
function slot() internal pure returns (struct AddressResolverStorage.Storage r)
```

