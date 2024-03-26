# Solidity API

## MixinLiquidationConfiguration

### InvalidLiquidationThresholdRate

```solidity
error InvalidLiquidationThresholdRate()
```

### InvalidFullLiquidationThresholdRate

```solidity
error InvalidFullLiquidationThresholdRate()
```

### InvalidLiquidationProtocolFeeRate

```solidity
error InvalidLiquidationProtocolFeeRate()
```

### InvalidLiquidatorFeeRate

```solidity
error InvalidLiquidatorFeeRate()
```

### LiquidationThresholdRateUpdated

```solidity
event LiquidationThresholdRateUpdated(uint256 previousRate, uint256 ratio)
```

### FullLiquidationThresholdRateUpdated

```solidity
event FullLiquidationThresholdRateUpdated(uint256 previousRate, uint256 ratio)
```

### LiquidationProtocolFeeRateUpdated

```solidity
event LiquidationProtocolFeeRateUpdated(uint256 previousRate, uint256 ratio)
```

### LiquidatorFeeRateUpdated

```solidity
event LiquidatorFeeRateUpdated(uint256 previousRate, uint256 ratio)
```

### _initialize

```solidity
function _initialize(address _owner, uint256 _liquidationThresholdRate, uint256 _fullLiquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate) internal
```

### getLiquidationConfiguration

```solidity
function getLiquidationConfiguration() public view returns (uint256 liquidationThresholdRate, uint256 fullLiquidationThresholdRate, uint256 liquidationProtocolFeeRate, uint256 liquidatorFeeRate)
```

_Gets the liquidation configuration_

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidationThresholdRate | uint256 | The liquidation threshold rate |
| fullLiquidationThresholdRate | uint256 | The full liquidation threshold rate |
| liquidationProtocolFeeRate | uint256 | The liquidation fee received by liquidators |
| liquidatorFeeRate | uint256 | The liquidation protocol fee received by protocol |

### updateLiquidationConfiguration

```solidity
function updateLiquidationConfiguration(uint256 _liquidationThresholdRate, uint256 _fullLiquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate) external
```

Triggers only be contract owner

_Update the liquidation configuration_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |
| _fullLiquidationThresholdRate | uint256 |  |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |

### _updateLiquidationConfiguration

```solidity
function _updateLiquidationConfiguration(uint256 _liquidationThresholdRate, uint256 _fullLiquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate) private
```

Triggers only be contract owner

_Update the liquidation configuration_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |
| _fullLiquidationThresholdRate | uint256 |  |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |

