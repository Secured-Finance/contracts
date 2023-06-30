# Solidity API

## LendingMarketConfigurationLogic

### OrderFeeRateUpdated

```solidity
event OrderFeeRateUpdated(bytes32 ccy, uint256 previousRate, uint256 rate)
```

### CircuitBreakerLimitRangeUpdated

```solidity
event CircuitBreakerLimitRangeUpdated(bytes32 ccy, uint256 previousRate, uint256 rate)
```

### ObservationPeriodUpdated

```solidity
event ObservationPeriodUpdated(uint256 previousPeriod, uint256 period)
```

### getCircuitBreakerLimitRange

```solidity
function getCircuitBreakerLimitRange(bytes32 _ccy) public view returns (uint256)
```

### getOrderFeeRate

```solidity
function getOrderFeeRate(bytes32 _ccy) public view returns (uint256)
```

### getObservationPeriod

```solidity
function getObservationPeriod() public view returns (uint256)
```

### calculateOrderFeeAmount

```solidity
function calculateOrderFeeAmount(bytes32 _ccy, uint256 _amount, uint256 _maturity) external view returns (uint256 orderFeeAmount)
```

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) external
```

### updateCircuitBreakerLimitRange

```solidity
function updateCircuitBreakerLimitRange(bytes32 _ccy, uint256 _limitRange) external
```

### updateObservationPeriod

```solidity
function updateObservationPeriod(uint256 _observationPeriod) external
```

