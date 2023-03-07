# Solidity API

## CollateralParametersHandler

CollateralParametersHandler is an library to handle the main collateral parameters.

### AutoLiquidationThresholdRateUpdated

```solidity
event AutoLiquidationThresholdRateUpdated(uint256 previousRate, uint256 ratio)
```

### LiquidationProtocolFeeRateUpdated

```solidity
event LiquidationProtocolFeeRateUpdated(uint256 previousRate, uint256 ratio)
```

### LiquidatorFeeRateUpdated

```solidity
event LiquidatorFeeRateUpdated(uint256 previousRate, uint256 ratio)
```

### UniswapRouterUpdated

```solidity
event UniswapRouterUpdated(address previousUniswapRouter, address uniswapRouter)
```

### UniswapQuoterUpdated

```solidity
event UniswapQuoterUpdated(address previousUniswapQuoter, address uniswapQuoter)
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
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |
| _uniswapRouter | address | Uniswap router contract address |
| _uniswapQuoter | address | Uniswap quoter contract address |

