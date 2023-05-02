# Solidity API

## FutureValueVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  address lendingMarket;
  mapping(address => int256) balances;
  mapping(address => uint256) futureValueMaturities;
  mapping(uint256 => uint256) totalSupply;
  mapping(uint256 => uint256) removedLendingSupply;
  mapping(uint256 => uint256) removedBorrowingSupply;
}
```

### slot

```solidity
function slot() internal pure returns (struct FutureValueVaultStorage.Storage r)
```

