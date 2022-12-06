# Solidity API

## CollateralParametersStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  uint256 liquidationThresholdRate;
  contract IUniswapV2Router02 uniswapRouter;
}
```

### slot

```solidity
function slot() internal pure returns (struct CollateralParametersStorage.Storage r)
```

