# Solidity API

## TokenVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(address => struct EnumerableSet.Bytes32Set) exposedUnsettledCurrencies;
  mapping(bytes32 => address) tokenAddresses;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => mapping(bytes32 => uint256)) collateralAmounts;
  mapping(address => mapping(bytes32 => uint256)) escrowedAmount;
}
```

### slot

```solidity
function slot() internal pure returns (struct TokenVaultStorage.Storage r)
```

## TokenVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(address => struct EnumerableSet.Bytes32Set) exposedUnsettledCurrencies;
  mapping(bytes32 => address) tokenAddresses;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => mapping(bytes32 => uint256)) collateralAmounts;
  mapping(address => mapping(bytes32 => uint256)) escrowedAmount;
}
```

### slot

```solidity
function slot() internal pure returns (struct TokenVaultStorage.Storage r)
```

