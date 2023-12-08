# Solidity API

## FutureValueVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(uint8 => mapping(address => int256)) balances;
  mapping(uint8 => mapping(address => uint256)) balanceMaturities;
  mapping(uint256 => uint256) totalLendingSupplies;
  mapping(uint256 => uint256) totalBorrowingSupplies;
  mapping(uint256 => uint256) removedLendingSupply;
  mapping(uint256 => uint256) removedBorrowingSupply;
}
```

### slot

```solidity
function slot() internal pure returns (struct FutureValueVaultStorage.Storage r)
```

