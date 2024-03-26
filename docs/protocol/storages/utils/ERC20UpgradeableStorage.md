# Solidity API

## ERC20UpgradeableStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(address => uint256) balances;
  mapping(address => mapping(address => uint256)) allowances;
  uint256 totalSupply;
  string name;
  string symbol;
}
```

### slot

```solidity
function slot() internal pure returns (struct ERC20UpgradeableStorage.Storage r)
```

