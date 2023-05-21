# Solidity API

## ILendingMarket

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
event OrderMade(uint48 orderId, address maker, enum ProtocolTypes.Side side, bytes32 ccy, uint256 maturity, uint256 amount, uint256 unitPrice)
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

### MarketOpened

```solidity
event MarketOpened(uint256 maturity, uint256 prevMaturity)
```

### ItayoseExecuted

```solidity
event ItayoseExecuted(bytes32 ccy, uint256 maturity, uint256 openingPrice)
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
function getOrder(uint48 _orderId) external view returns (enum ProtocolTypes.Side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp)
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
function getLendOrderIds(address _user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(address _user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### estimateFilledAmount

```solidity
function estimateFilledAmount(enum ProtocolTypes.Side _side, uint256 _futureValue) external view returns (uint256 amount)
```

### openMarket

```solidity
function openMarket(uint256 maturity, uint256 openingDate) external returns (uint256)
```

### cancelOrder

```solidity
function cancelOrder(address user, uint48 orderId) external returns (enum ProtocolTypes.Side, uint256, uint256)
```

### createPreOrder

```solidity
function createPreOrder(enum ProtocolTypes.Side side, address user, uint256 amount, uint256 unitPrice) external
```

### unwind

```solidity
function unwind(enum ProtocolTypes.Side _side, address _user, uint256 _futureValue) external returns (uint256 filledUnitPrice, uint256 filledAmount, uint256 filledFutureValue, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder)
```

### executeItayoseCall

```solidity
function executeItayoseCall() external returns (uint256 openingUnitPrice, uint256 totalOffsetAmount, uint256 openingDate, struct ILendingMarket.PartiallyFilledOrder partiallyFilledLendingOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

### cleanUpOrders

```solidity
function cleanUpOrders(address _user) external returns (uint256 activeLendOrderCount, uint256 activeBorrowOrderCount, uint256 removedLendOrderFutureValue, uint256 removedBorrowOrderFutureValue, uint256 removedLendOrderAmount, uint256 removedBorrowOrderAmount, uint256 maturity)
```

### createOrder

```solidity
function createOrder(enum ProtocolTypes.Side side, address account, uint256 amount, uint256 unitPrice, bool ignoreRemainingAmount) external returns (uint256 filledUnitPrice, uint256 filledFutureValue, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder, uint256 remainingAmount)
```

### pauseMarket

```solidity
function pauseMarket() external
```

### unpauseMarket

```solidity
function unpauseMarket() external
```

