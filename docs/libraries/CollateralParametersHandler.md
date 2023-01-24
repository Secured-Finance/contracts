# Solidity API

## CollateralParametersHandler

CollateralParametersHandler is an library to handle the parameters fro TokenVault contract.

This manage the main collateral parameters like Margin Call ratio, Auto-Liquidation level,
Liquidation price, and Minimal collateral ratio.

### UpdateAutoLiquidationThresholdRate

```solidity
event UpdateAutoLiquidationThresholdRate(uint256 previousRate, uint256 ratio)
```

### UpdateLiquidationProtocolFeeRate

```solidity
event UpdateLiquidationProtocolFeeRate(uint256 previousRate, uint256 ratio)
```

### UpdateLiquidatorFeeRate

```solidity
event UpdateLiquidatorFeeRate(uint256 previousRate, uint256 ratio)
```

### UpdateUniswapRouter

```solidity
event UpdateUniswapRouter(address previousUniswapRouter, address uniswapRouter)
```

### UpdateUniswapQuoter

```solidity
event UpdateUniswapQuoter(address previousUniswapQuoter, address uniswapQuoter)
```

### liquidationThresholdRate

```solidity
function liquidationThresholdRate() internal view returns (uint256)
```

_Gets the liquidation threshold rate_

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The liquidation threshold rate |

### liquidatorFeeRate

```solidity
function liquidatorFeeRate() internal view returns (uint256)
```

_Gets the liquidation fee received by liquidators_

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The liquidation fee received by liquidators |

### liquidationProtocolFeeRate

```solidity
function liquidationProtocolFeeRate() internal view returns (uint256)
```

_Gets the liquidation protocol fee received by protocol_

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The liquidation protocol fee received by protocol |

### uniswapRouter

```solidity
function uniswapRouter() internal view returns (contract ISwapRouter)
```

_Gets Uniswap Router contract address_

### uniswapQuoter

```solidity
function uniswapQuoter() internal view returns (contract IQuoter)
```

_Gets Uniswap Quoter contract address_

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _liquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate, address _uniswapRouter, address _uniswapQuoter) internal
```

Triggers only be contract owner

_Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | Liquidation fee received by protocol |
| _liquidatorFeeRate | uint256 | Liquidation fee received by liquidators |
| _uniswapRouter | address | Uniswap router contract address |
| _uniswapQuoter | address | Uniswap quoter contract address |

