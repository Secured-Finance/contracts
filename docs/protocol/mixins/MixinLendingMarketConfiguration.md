# Solidity API

## MixinLendingMarketConfiguration

### _initialize

```solidity
function _initialize(address _owner) internal
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

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) public
```

Updates the order fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _orderFeeRate | uint256 | The order fee rate received by protocol |

### updateCircuitBreakerLimitRange

```solidity
function updateCircuitBreakerLimitRange(bytes32 _ccy, uint256 _cbLimitRange) public
```

Updates the auto-roll fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _cbLimitRange | uint256 | The circuit breaker limit range |

