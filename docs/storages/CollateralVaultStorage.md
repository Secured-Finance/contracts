# Solidity API

## CollateralVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Book

```solidity
struct Book {
  uint256 independentAmount;
  uint256 lockedCollateral;
}
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => address) tokenAddresses;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => mapping(bytes32 => struct CollateralVaultStorage.Book)) books;
}
```

### slot

```solidity
function slot() internal pure returns (struct CollateralVaultStorage.Storage r)
```

