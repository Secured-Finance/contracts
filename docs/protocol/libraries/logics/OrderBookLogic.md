# Solidity API

## OrderBookLogic

### getHighestLendingUnitPrice

```solidity
function getHighestLendingUnitPrice() public view returns (uint256)
```

### getLowestBorrowingUnitPrice

```solidity
function getLowestBorrowingUnitPrice() public view returns (uint256)
```

### hasBorrowOrder

```solidity
function hasBorrowOrder(address _user) external view returns (bool)
```

### hasLendOrder

```solidity
function hasLendOrder(address _user) external view returns (bool)
```

### getLendOrderBook

```solidity
function getLendOrderBook(uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getOrder

```solidity
function getOrder(uint48 _orderId) external view returns (enum ProtocolTypes.Side side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp, bool isPreOrder)
```

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(address _user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(address _user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getLendOrderIds

```solidity
function getLendOrderIds(address _user) public view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(address _user) public view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### estimateFilledAmount

```solidity
function estimateFilledAmount(enum ProtocolTypes.Side _side, uint256 _futureValue) external view returns (uint256 amount)
```

### insertOrder

```solidity
function insertOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice) external returns (uint48 orderId)
```

### dropOrders

```solidity
function dropOrders(enum ProtocolTypes.Side _side, uint256 _amount, uint256 _futureValue, uint256 _unitPrice) external returns (uint256 filledUnitPrice, uint256 filledAmount, uint256 filledFutureValue, uint48 partiallyFilledOrderId, address partiallyFilledMaker, uint256 partiallyFilledAmount, uint256 partiallyFilledFutureValue, uint256 remainingAmount)
```

### cleanLendOrders

```solidity
function cleanLendOrders(address _user) external returns (uint48[] orderIds, uint256 activeOrderCount, uint256 removedFutureValue, uint256 removedOrderAmount)
```

### cleanBorrowOrders

```solidity
function cleanBorrowOrders(address _user) external returns (uint48[] orderIds, uint256 activeOrderCount, uint256 removedFutureValue, uint256 removedOrderAmount)
```

### removeOrder

```solidity
function removeOrder(address _user, uint48 _orderId) external returns (enum ProtocolTypes.Side, uint256, uint256)
```

### getOpeningUnitPrice

```solidity
function getOpeningUnitPrice() external view returns (uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

### checkCircuitBreakerThreshold

```solidity
function checkCircuitBreakerThreshold(enum ProtocolTypes.Side _side, uint256 _unitPrice, uint256 _circuitBreakerLimitRange) external returns (bool isFilled, uint256 executedUnitPrice, bool ignoreRemainingAmount)
```

### _getBorrowCircuitBreakerThreshold

```solidity
function _getBorrowCircuitBreakerThreshold(uint256 _circuitBreakerLimitRange, uint256 _unitPrice) internal pure returns (uint256 cbThresholdUnitPrice)
```

### _getLendCircuitBreakerThreshold

```solidity
function _getLendCircuitBreakerThreshold(uint256 _circuitBreakerLimitRange, uint256 _unitPrice) internal pure returns (uint256 cbThresholdUnitPrice)
```

### _nextOrderId

```solidity
function _nextOrderId() internal returns (uint48)
```

Increases and returns id of last order in order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint48 | The new order id |

### _removeOrderIdFromOrders

```solidity
function _removeOrderIdFromOrders(uint48[] orders, uint256 orderId) internal
```

### _getLendOrderAmounts

```solidity
function _getLendOrderAmounts(uint48 _orderId) internal view returns (uint256 presentValue, uint256 futureValue)
```

### _getBorrowOrderAmounts

```solidity
function _getBorrowOrderAmounts(uint48 _orderId) internal view returns (uint256 presentValue, uint256 futureValue)
```

