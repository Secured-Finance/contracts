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

### _calculateOrderFeeAmount

```solidity
function _calculateOrderFeeAmount(bytes32 _ccy, uint256 _amount, uint256 _maturity) internal view returns (uint256 orderFeeAmount)
```

