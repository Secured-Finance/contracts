# Solidity API

## MixinLendingMarketManager

### OrderFeeRateUpdated

```solidity
event OrderFeeRateUpdated(uint256 previousRate, uint256 rate)
```

### AutoRollFeeRateUpdated

```solidity
event AutoRollFeeRateUpdated(uint256 previousRate, uint256 rate)
```

### ObservationPeriodUpdated

```solidity
event ObservationPeriodUpdated(uint256 previousPeriod, uint256 period)
```

### _initialize

```solidity
function _initialize(address _owner, uint256 _observationPeriod) internal
```

### getOrderFeeRate

```solidity
function getOrderFeeRate(bytes32 _ccy) public view returns (uint256)
```

Gets the order fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The order fee rate received by protocol |

### getAutoRollFeeRate

```solidity
function getAutoRollFeeRate(bytes32 _ccy) public view returns (uint256)
```

Gets the auto-roll fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The auto-roll fee rate received by protocol |

### getObservationPeriod

```solidity
function getObservationPeriod() public view returns (uint256)
```

Gets the observation period

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The observation period to calculate the volume-weighted average price of transactions |

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) public
```

Updates the order fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _orderFeeRate | uint256 | The order fee rate received by protocol |

### updateAutoRollFeeRate

```solidity
function updateAutoRollFeeRate(bytes32 _ccy, uint256 _autoRollFeeRate) public
```

Updates the auto-roll fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _autoRollFeeRate | uint256 | The order fee rate received by protocol |

### updateObservationPeriod

```solidity
function updateObservationPeriod(uint256 _observationPeriod) public
```

Updates the observation period

| Name | Type | Description |
| ---- | ---- | ----------- |
| _observationPeriod | uint256 | The observation period to calculate the volume-weighted average price of transactions |

### _updateObservationPeriod

```solidity
function _updateObservationPeriod(uint256 _observationPeriod) internal
```

### _calculateOrderFeeAmount

```solidity
function _calculateOrderFeeAmount(bytes32 _ccy, uint256 _amount, uint256 _maturity) internal view returns (uint256 orderFeeAmount)
```

