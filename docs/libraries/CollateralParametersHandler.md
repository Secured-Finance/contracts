# Solidity API

## CollateralParametersHandler

CollateralParametersHandler is an library to handle the parameters fro CollateralAggregator contract.

This manage the main collateral parameters like Margin Call ratio, Auto-Liquidation level,
Liquidation price, and Minimal collateral ratio.

### LiquidationPriceRateUpdated

```solidity
event LiquidationPriceRateUpdated(uint256 previousPrice, uint256 price)
```

### AutoLiquidationThresholdRateUpdated

```solidity
event AutoLiquidationThresholdRateUpdated(uint256 previousRatio, uint256 ratio)
```

### MarginCallThresholdRateUpdated

```solidity
event MarginCallThresholdRateUpdated(uint256 previousRatio, uint256 ratio)
```

### MinCollateralRateUpdated

```solidity
event MinCollateralRateUpdated(uint256 previousRatio, uint256 price)
```

### getCollateralParameters

```solidity
function getCollateralParameters() internal view returns (uint256, uint256, uint256, uint256)
```

_Gets collateral parameters_

### autoLiquidationThresholdRate

```solidity
function autoLiquidationThresholdRate() internal view returns (uint256)
```

_Gets auto liquidation threshold rate_

### liquidationPriceRate

```solidity
function liquidationPriceRate() internal view returns (uint256)
```

_Gets liquidation price rate_

### marginCallThresholdRate

```solidity
function marginCallThresholdRate() internal view returns (uint256)
```

_Gets margin call threshold rate_

### minCollateralRate

```solidity
function minCollateralRate() internal view returns (uint256)
```

_Gets min collateral rate_

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _marginCallThresholdRate, uint256 _autoLiquidationThresholdRate, uint256 _liquidationPriceRate, uint256 _minCollateralRate) internal
```

Triggers only be contract owner

_Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _marginCallThresholdRate | uint256 | Margin call threshold ratio |
| _autoLiquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| _liquidationPriceRate | uint256 | Liquidation price rate |
| _minCollateralRate | uint256 | Minimal collateral rate |

### _updateMarginCallThresholdRate

```solidity
function _updateMarginCallThresholdRate(uint256 _rate) private
```

### _updateAutoLiquidationThresholdRate

```solidity
function _updateAutoLiquidationThresholdRate(uint256 _rate) private
```

### _updateLiquidationPriceRate

```solidity
function _updateLiquidationPriceRate(uint256 _rate) private
```

### _updateMinCollateralRate

```solidity
function _updateMinCollateralRate(uint256 _rate) private
```

