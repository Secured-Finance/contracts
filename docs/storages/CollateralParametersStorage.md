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
  uint256 liquidationProtocolFeeRate;
  uint256 liquidatorFeeRate;
  contract ISwapRouter uniswapRouter;
  contract IQuoter uniswapQuoter;
}
```

### slot

```solidity
function slot() internal pure returns (struct CollateralParametersStorage.Storage r)
```

