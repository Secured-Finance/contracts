# Solidity API

## FutureValueStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  uint256 maturity;
  mapping(address => int256) balances;
  mapping(address => uint256) futureValueMaturities;
  mapping(uint256 => uint256) totalLendingSupply;
  mapping(uint256 => uint256) totalBorrowingSupply;
}
```

### slot

```solidity
function slot() internal pure returns (struct FutureValueStorage.Storage r)
```

