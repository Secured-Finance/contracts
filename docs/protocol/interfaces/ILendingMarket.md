# Solidity API

## ILendingMarket

### OrderExecutionConditions

```solidity
struct OrderExecutionConditions {
  bool isFilled;
  uint256 executedUnitPrice;
  uint256 cbThresholdUnitPrice;
  bool ignoreRemainingAmount;
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

### FilledOrder

```solidity
struct FilledOrder {
  uint256 amount;
  uint256 unitPrice;
  uint256 futureValue;
  uint256 ignoredAmount;
}
```

### PartiallyFilledOrder

```solidity
struct PartiallyFilledOrder {
  uint48 orderId;
  address maker;
  uint256 amount;
  uint256 futureValue;
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
event OrderExecuted(address user, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 inputAmount, uint256 inputUnitPrice, uint256 filledAmount, uint256 filledUnitPrice, uint256 filledFutureValue, uint48 placedOrderId, uint256 placedAmount, uint256 placedUnitPrice, uint256 cbThresholdUnitPrice)
```

### PreOrderExecuted

```solidity
event PreOrderExecuted(address user, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 unitPrice, uint48 orderId)
```

### PositionUnwound

```solidity
event PositionUnwound(address user, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 futureValue, uint256 filledAmount, uint256 filledUnitPrice, uint256 filledFutureValue, uint256 cbThresholdUnitPrice)
```

### MarketOpened

```solidity
event MarketOpened(uint256 maturity, uint256 prevMaturity)
```

### ItayoseExecuted

```solidity
event ItayoseExecuted(bytes32 ccy, uint256 maturity, uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 offsetAmount)
```

### Market

```solidity
struct Market {
  bytes32 ccy;
  uint256 maturity;
  uint256 openingDate;
  uint256 borrowUnitPrice;
  uint256 lendUnitPrice;
  uint256 midUnitPrice;
  uint256 openingUnitPrice;
  bool isReady;
}
```

### getMarket

```solidity
function getMarket() external view returns (struct ILendingMarket.Market)
```

### getCircuitBreakerThresholds

```solidity
function getCircuitBreakerThresholds(uint256 _circuitBreakerLimitRange) external view returns (uint256 lendCircuitBreakerThreshold, uint256 borrowCircuitBreakerThreshold)
```

### getBorrowUnitPrice

```solidity
function getBorrowUnitPrice() external view returns (uint256 unitPrice)
```

### getLendUnitPrice

```solidity
function getLendUnitPrice() external view returns (uint256 unitPrice)
```

### getMidUnitPrice

```solidity
function getMidUnitPrice() external view returns (uint256 unitPrice)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint256 limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getLendOrderBook

```solidity
function getLendOrderBook(uint256 limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getMaturity

```solidity
function getMaturity() external view returns (uint256)
```

### getCurrency

```solidity
function getCurrency() external view returns (bytes32)
```

### getOpeningDate

```solidity
function getOpeningDate() external view returns (uint256)
```

### isReady

```solidity
function isReady() external view returns (bool)
```

### isMatured

```solidity
function isMatured() external view returns (bool)
```

### isOpened

```solidity
function isOpened() external view returns (bool)
```

### isItayosePeriod

```solidity
function isItayosePeriod() external view returns (bool)
```

### isPreOrderPeriod

```solidity
function isPreOrderPeriod() external returns (bool)
```

### getItayoseLog

```solidity
function getItayoseLog(uint256 maturity) external view returns (struct ItayoseLog)
```

### getOrder

```solidity
function getOrder(uint48 orderId) external view returns (enum ProtocolTypes.Side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp, bool isPreOrder)
```

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(address user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(address user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getLendOrderIds

```solidity
function getLendOrderIds(address user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(address user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### calculateFilledAmount

```solidity
function calculateFilledAmount(enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice, uint256 _circuitBreakerLimitRange) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV)
```

### openMarket

```solidity
function openMarket(uint256 maturity, uint256 openingDate) external returns (uint256)
```

### cancelOrder

```solidity
function cancelOrder(address user, uint48 orderId) external
```

### executeOrder

```solidity
function executeOrder(enum ProtocolTypes.Side side, address account, uint256 amount, uint256 unitPrice, uint256 circuitBreakerLimitRange) external returns (struct ILendingMarket.FilledOrder filledOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder)
```

### executePreOrder

```solidity
function executePreOrder(enum ProtocolTypes.Side side, address user, uint256 amount, uint256 unitPrice) external
```

### unwindPosition

```solidity
function unwindPosition(enum ProtocolTypes.Side side, address user, uint256 futureValue, uint256 circuitBreakerLimitRange) external returns (struct ILendingMarket.FilledOrder filledOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder)
```

### executeItayoseCall

```solidity
function executeItayoseCall() external returns (uint256 openingUnitPrice, uint256 totalOffsetAmount, uint256 openingDate, struct ILendingMarket.PartiallyFilledOrder partiallyFilledLendingOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

### cleanUpOrders

```solidity
function cleanUpOrders(address user) external returns (uint256 activeLendOrderCount, uint256 activeBorrowOrderCount, uint256 removedLendOrderFutureValue, uint256 removedBorrowOrderFutureValue, uint256 removedLendOrderAmount, uint256 removedBorrowOrderAmount, uint256 maturity)
```

### pauseMarket

```solidity
function pauseMarket() external
```

### unpauseMarket

```solidity
function unpauseMarket() external
```

