# Solidity API

## MixinLendingMarketConfiguration

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

### getCircuitBreakerLimitRange

```solidity
function getCircuitBreakerLimitRange(bytes32 _ccy) public view returns (uint256)
```

Gets the limit range in unit price for the circuit breaker

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

### updateCircuitBreakerLimitRange

```solidity
function updateCircuitBreakerLimitRange(bytes32 _ccy, uint256 _limitRange) public
```

Updates the auto-roll fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _limitRange | uint256 | The circuit breaker limit range |

### updateObservationPeriod

```solidity
function updateObservationPeriod(uint256 _observationPeriod) public
```

Updates the observation period

| Name | Type | Description |
| ---- | ---- | ----------- |
| _observationPeriod | uint256 | The observation period to calculate the volume-weighted average price of transactions |

