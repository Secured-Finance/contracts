# Solidity API

## ILendingMarket

### FilledOrder

```solidity
struct FilledOrder {
  uint256 unitPrice;
  uint256 amount;
  uint256 futureValue;
  uint256 ignoredAmount;
}
```

### PartiallyFilledOrder

```solidity
struct PartiallyFilledOrder {
  address maker;
  uint256 amount;
  uint256 futureValue;
}
```

### OrderCanceled

```solidity
event OrderCanceled(uint48 orderId, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 unitPrice)
```

### OrderMade

```solidity
event OrderMade(uint48 orderId, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 unitPrice, bool isPreOrder)
```

### OrdersTaken

```solidity
event OrdersTaken(address taker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 filledAmount, uint256 unitPrice, uint256 filledFutureValue)
```

### OrderPartiallyTaken

```solidity
event OrderPartiallyTaken(uint48 orderId, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 filledAmount, uint256 filledFutureValue)
```

### OrdersCleaned

```solidity
event OrdersCleaned(uint48[] orderIds, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity)
```

### OrderBlockedByCircuitBreaker

```solidity
event OrderBlockedByCircuitBreaker(address user, bytes32 ccy, enum ProtocolTypes.Side side, uint256 maturity, uint256 thresholdUnitPrice)
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

### getOpeningUnitPrice

```solidity
function getOpeningUnitPrice() external view returns (uint256)
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

### estimateFilledAmount

```solidity
function estimateFilledAmount(enum ProtocolTypes.Side side, uint256 futureValue) external view returns (uint256 amount)
```

### openMarket

```solidity
function openMarket(uint256 maturity, uint256 openingDate) external returns (uint256)
```

### cancelOrder

```solidity
function cancelOrder(address user, uint48 orderId) external
```

### createOrder

```solidity
function createOrder(enum ProtocolTypes.Side side, address account, uint256 amount, uint256 unitPrice, uint256 circuitBreakerLimitRange) external returns (struct ILendingMarket.FilledOrder filledOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder)
```

### createPreOrder

```solidity
function createPreOrder(enum ProtocolTypes.Side side, address user, uint256 amount, uint256 unitPrice) external
```

### unwind

```solidity
function unwind(enum ProtocolTypes.Side side, address user, uint256 futureValue, uint256 circuitBreakerLimitRange) external returns (struct ILendingMarket.FilledOrder filledOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder)
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

