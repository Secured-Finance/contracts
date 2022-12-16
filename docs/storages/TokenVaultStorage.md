# Solidity API

## TokenVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  struct EnumerableSet.Bytes32Set collateralCurrencies;
  mapping(bytes32 => address) tokenAddresses;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => mapping(bytes32 => uint256)) depositAmounts;
  mapping(address => mapping(bytes32 => uint256)) escrowedAmount;
}
```

### slot

```solidity
function slot() internal pure returns (struct TokenVaultStorage.Storage r)
```

