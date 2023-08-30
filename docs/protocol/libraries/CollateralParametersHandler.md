# Solidity API

## CollateralParametersHandler

CollateralParametersHandler is an library to handle the main collateral parameters.

### InvalidLiquidationThresholdRate

```solidity
error InvalidLiquidationThresholdRate()
```

### InvalidLiquidationProtocolFeeRate

```solidity
error InvalidLiquidationProtocolFeeRate()
```

### InvalidLiquidatorFeeRate

```solidity
error InvalidLiquidatorFeeRate()
```

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

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _liquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate) internal
```

Triggers only be contract owner

_Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |

