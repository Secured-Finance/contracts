# Solidity API

## MaturityUnitPrice

```solidity
struct MaturityUnitPrice {
  uint256 unitPrice;
  uint256 compoundFactor;
  uint256 next;
  uint256 prev;
}
```

## GenesisValueVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => bool) isInitialized;
  mapping(bytes32 => uint256) initialCompoundFactors;
  mapping(bytes32 => uint256) compoundFactors;
  mapping(bytes32 => uint256) currentMaturity;
  mapping(bytes32 => uint8) decimals;
  mapping(bytes32 => mapping(address => int256)) balances;
  mapping(bytes32 => uint256) totalLendingSupplies;
  mapping(bytes32 => uint256) totalBorrowingSupplies;
  mapping(bytes32 => mapping(uint256 => struct MaturityUnitPrice)) maturityUnitPrices;
}
```

### slot

```solidity
function slot() internal pure returns (struct GenesisValueVaultStorage.Storage r)
```

