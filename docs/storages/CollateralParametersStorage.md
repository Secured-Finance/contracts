# Solidity API

## CollateralParametersStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  uint256 liquidationPriceRate;
  uint256 marginCallThresholdRate;
  uint256 autoLiquidationThresholdRate;
  uint256 minCollateralRate;
}
```

### slot

```solidity
function slot() internal pure returns (struct CollateralParametersStorage.Storage r)
```

