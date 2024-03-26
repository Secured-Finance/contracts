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

## AutoRollLog

```solidity
struct AutoRollLog {
  uint256 unitPrice;
  uint256 lendingCompoundFactor;
  uint256 borrowingCompoundFactor;
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
  mapping(bytes32 => uint256) lendingCompoundFactors;
  mapping(bytes32 => uint256) borrowingCompoundFactors;
  mapping(bytes32 => uint256) currentMaturity;
  mapping(bytes32 => uint8) decimals;
  mapping(bytes32 => mapping(address => int256)) balances;
  mapping(bytes32 => uint256) totalLendingSupplies;
  mapping(bytes32 => uint256) totalBorrowingSupplies;
  mapping(bytes32 => mapping(uint256 => int256)) maturityBalances;
  mapping(bytes32 => mapping(uint256 => struct AutoRollLog)) autoRollLogs;
  mapping(bytes32 => mapping(address => uint256)) userMaturities;
  mapping(bytes32 => uint256) totalLockedBalances;
}
```

### slot

```solidity
function slot() internal pure returns (struct GenesisValueVaultStorage.Storage r)
```

