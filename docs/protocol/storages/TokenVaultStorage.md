# Solidity API

## TokenVaultStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  uint256 liquidationThresholdRate;
  uint256 liquidationProtocolFeeRate;
  uint256 liquidatorFeeRate;
  struct EnumerableSet.Bytes32Set collateralCurrencies;
  mapping(bytes32 => address) tokenAddresses;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(bytes32 => uint256) totalDepositAmount;
  mapping(address => mapping(bytes32 => uint256)) depositAmounts;
  uint256 fullLiquidationThresholdRate;
}
```

### slot

```solidity
function slot() internal pure returns (struct TokenVaultStorage.Storage r)
```

