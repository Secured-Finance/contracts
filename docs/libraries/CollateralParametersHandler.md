# Solidity API

## CollateralParametersHandler

CollateralParametersHandler is an library to handle the parameters fro TokenVault contract.

This manage the main collateral parameters like Margin Call ratio, Auto-Liquidation level,
Liquidation price, and Minimal collateral ratio.

### UpdateAutoLiquidationThresholdRate

```solidity
event UpdateAutoLiquidationThresholdRate(uint256 previousRatio, uint256 ratio)
```

### UpdateUniswapRouter

```solidity
event UpdateUniswapRouter(address previousUniswapRouter, address uniswapRouter)
```

### liquidationThresholdRate

```solidity
function liquidationThresholdRate() internal view returns (uint256)
```

_Gets liquidation threshold rate_

### uniswapRouter

```solidity
function uniswapRouter() internal view returns (contract ISwapRouter)
```

_Gets Uniswap Router contract address_

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _liquidationThresholdRate, address _uniswapRouter) internal
```

Triggers only be contract owner

_Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| _uniswapRouter | address | Uniswap router contract address |

### _updateAutoLiquidationThresholdRate

```solidity
function _updateAutoLiquidationThresholdRate(uint256 _rate) private
```

### _updateUniswapRouter

```solidity
function _updateUniswapRouter(address _uniswapRouter) private
```

