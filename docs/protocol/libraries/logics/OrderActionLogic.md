# Solidity API

## OrderActionLogic

### InvalidAmount

```solidity
error InvalidAmount()
```

### InvalidFutureValue

```solidity
error InvalidFutureValue()
```

### EmptyOrderBook

```solidity
error EmptyOrderBook()
```

### OppositeSideOrderExists

```solidity
error OppositeSideOrderExists()
```

### OrderExecutionConditions

```solidity
struct OrderExecutionConditions {
  bool isFilled;
  uint256 executedUnitPrice;
  bool ignoreRemainingAmount;
  bool orderExists;
}
```

### PlacedOrder

```solidity
struct PlacedOrder {
  uint48 orderId;
  uint256 amount;
  uint256 unitPrice;
}
```

### ExecuteOrderVars

```solidity
struct ExecuteOrderVars {
  struct OrderActionLogic.OrderExecutionConditions conditions;
  struct OrderActionLogic.PlacedOrder placedOrder;
  bool isCircuitBreakerTriggered;
  uint256 maturity;
}
```

### FillOrdersVars

```solidity
struct FillOrdersVars {
  uint8 orderBookId;
  uint256 remainingAmount;
  bool orderExists;
}
```

### OrderCanceled

```solidity
event OrderCanceled(uint48 orderId, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 unitPrice)
```

### OrdersCleaned

```solidity
event OrdersCleaned(uint48[] orderIds, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 futureValue)
```

### OrderExecuted

```solidity
event OrderExecuted(address user, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 inputAmount, uint256 inputUnitPrice, uint256 filledAmount, uint256 filledUnitPrice, uint256 filledAmountInFV, uint256 feeInFV, uint48 placedOrderId, uint256 placedAmount, uint256 placedUnitPrice, bool isCircuitBreakerTriggered)
```

### PreOrderExecuted

```solidity
event PreOrderExecuted(address user, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 unitPrice, uint48 orderId)
```

### PositionUnwound

```solidity
event PositionUnwound(address user, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 inputFutureValue, uint256 filledAmount, uint256 filledUnitPrice, uint256 filledAmountInFV, uint256 feeInFV, bool isCircuitBreakerTriggered)
```

### cancelOrder

```solidity
function cancelOrder(uint8 _orderBookId, address _user, uint48 _orderId) external
```

### cleanUpOrders

```solidity
function cleanUpOrders(uint8 _orderBookId, address _user) external returns (uint256 activeLendOrderCount, uint256 activeBorrowOrderCount, uint256 removedLendOrderFutureValue, uint256 removedBorrowOrderFutureValue, uint256 removedLendOrderAmount, uint256 removedBorrowOrderAmount, uint256 maturity)
```

### executeOrder

```solidity
function executeOrder(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice, uint256 _minimumReliableAmount) external returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV)
```

### executePreOrder

```solidity
function executePreOrder(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice) external
```

### unwindPosition

```solidity
function unwindPosition(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _futureValue, uint256 _minimumReliableAmount) external returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV)
```

### _cleanLendOrders

```solidity
function _cleanLendOrders(uint8 _orderBookId, address _user) internal returns (uint48[] orderIds, uint256 activeOrderCount, uint256 removedFutureValue, uint256 removedOrderAmount)
```

### _cleanBorrowOrders

```solidity
function _cleanBorrowOrders(uint8 _orderBookId, address _user) internal returns (uint48[] orderIds, uint256 activeOrderCount, uint256 removedFutureValue, uint256 removedOrderAmount)
```

### _fillOrders

```solidity
function _fillOrders(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice, bool _ignoreRemainingAmount) private returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, struct OrderActionLogic.PlacedOrder placedOrder, bool isCircuitBreakerTriggered)
```

Fills orders in the order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Unit price taken |
| _ignoreRemainingAmount | bool | Boolean for whether to ignore the remaining amount after filling orders |

### _unwindPosition

```solidity
function _unwindPosition(uint8 _orderBookId, enum ProtocolTypes.Side _side, uint256 _futureValue, uint256 _unitPrice) private returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, bool isCircuitBreakerTriggered)
```

### _getOrderBook

```solidity
function _getOrderBook(uint8 _orderBookId) private view returns (struct OrderBookLib.OrderBook)
```

