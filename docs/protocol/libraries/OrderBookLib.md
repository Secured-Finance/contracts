# Solidity API

## PlacedOrder

```solidity
struct PlacedOrder {
  enum ProtocolTypes.Side side;
  uint256 unitPrice;
  uint256 maturity;
  uint256 timestamp;
}
```

## FilledOrder

```solidity
struct FilledOrder {
  uint256 amount;
  uint256 unitPrice;
  uint256 futureValue;
  uint256 ignoredAmount;
}
```

## PartiallyFilledOrder

```solidity
struct PartiallyFilledOrder {
  uint48 orderId;
  address maker;
  uint256 amount;
  uint256 futureValue;
}
```

## OrderBookLib

### PRE_ORDER_BASE_PERIOD

```solidity
uint256 PRE_ORDER_BASE_PERIOD
```

### ITAYOSE_PERIOD

```solidity
uint256 ITAYOSE_PERIOD
```

### CIRCUIT_BREAKER_MINIMUM_LEND_RANGE

```solidity
uint256 CIRCUIT_BREAKER_MINIMUM_LEND_RANGE
```

### CIRCUIT_BREAKER_MINIMUM_BORROW_RANGE

```solidity
uint256 CIRCUIT_BREAKER_MINIMUM_BORROW_RANGE
```

### EmptyOrderBook

```solidity
error EmptyOrderBook()
```

### PastMaturityOrderExists

```solidity
error PastMaturityOrderExists()
```

### OrderBook

```solidity
struct OrderBook {
  uint256 maturity;
  uint256 openingDate;
  uint256 preOpeningDate;
  uint48 lastOrderId;
  uint48 lastOrderTimestamp;
  bool isReliableBlock;
  uint80 blockUnitPriceHistory;
  uint48 lastBlockUnitPriceTimestamp;
  uint256 blockTotalAmount;
  uint256 blockTotalFutureValue;
  mapping(address => uint48[]) activeLendOrderIds;
  mapping(address => uint48[]) activeBorrowOrderIds;
  mapping(address => uint256) userCurrentMaturities;
  mapping(uint48 => uint256) orders;
  mapping(uint48 => bool) isPreOrder;
  mapping(uint256 => struct OrderStatisticsTreeLib.Tree) lendOrders;
  mapping(uint256 => struct OrderStatisticsTreeLib.Tree) borrowOrders;
}
```

### initialize

```solidity
function initialize(struct OrderBookLib.OrderBook self, uint256 _maturity, uint256 _openingDate, uint256 _preOpeningDate) internal returns (bool isReady)
```

### isMatured

```solidity
function isMatured(struct OrderBookLib.OrderBook self) internal view returns (bool)
```

### getBestBorrowUnitPrice

```solidity
function getBestBorrowUnitPrice(struct OrderBookLib.OrderBook self) internal view returns (uint256)
```

### getBestLendUnitPrice

```solidity
function getBestLendUnitPrice(struct OrderBookLib.OrderBook self) internal view returns (uint256)
```

### hasBorrowOrder

```solidity
function hasBorrowOrder(struct OrderBookLib.OrderBook self, address _user) internal view returns (bool)
```

### hasLendOrder

```solidity
function hasLendOrder(struct OrderBookLib.OrderBook self, address _user) internal view returns (bool)
```

### getOrder

```solidity
function getOrder(struct OrderBookLib.OrderBook self, uint48 _orderId) internal view returns (struct PlacedOrder order)
```

### getBlockUnitPriceHistory

```solidity
function getBlockUnitPriceHistory(struct OrderBookLib.OrderBook self, bool _isReadOnly) internal view returns (uint256[] prices, uint48 timestamp)
```

### getMarketUnitPrice

```solidity
function getMarketUnitPrice(struct OrderBookLib.OrderBook self, bool _isReadOnly) internal view returns (uint256 unitPrice)
```

### getBlockUnitPriceAverage

```solidity
function getBlockUnitPriceAverage(struct OrderBookLib.OrderBook self, uint256 maxCount, bool _isReadOnly) internal view returns (uint256 unitPrice)
```

### getLendOrderBook

```solidity
function getLendOrderBook(struct OrderBookLib.OrderBook self, uint256 _start, uint256 _limit) internal view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities, uint256 next)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(struct OrderBookLib.OrderBook self, uint256 _start, uint256 _limit) internal view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities, uint256 next)
```

### getLendOrderIds

```solidity
function getLendOrderIds(struct OrderBookLib.OrderBook self, address _user) internal view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(struct OrderBookLib.OrderBook self, address _user) internal view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### calculateFilledAmount

```solidity
function calculateFilledAmount(struct OrderBookLib.OrderBook self, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) internal view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV)
```

### updateUserMaturity

```solidity
function updateUserMaturity(struct OrderBookLib.OrderBook self, address _user) internal
```

### placeOrder

```solidity
function placeOrder(struct OrderBookLib.OrderBook self, enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice) internal returns (uint48 orderId)
```

### fillOrders

```solidity
function fillOrders(struct OrderBookLib.OrderBook self, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _amountInFV, uint256 _unitPrice) internal returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 remainingAmount, bool orderExists)
```

### setInitialBlockUnitPrice

```solidity
function setInitialBlockUnitPrice(struct OrderBookLib.OrderBook self, uint256 _unitPrice) internal
```

### updateBlockUnitPriceHistory

```solidity
function updateBlockUnitPriceHistory(struct OrderBookLib.OrderBook self, uint256 _filledAmount, uint256 _filledFutureValue, uint256 _minimumReliableAmount) internal returns (uint256 latestBlockUnitPrice, bool isUpdated)
```

### removeOrder

```solidity
function removeOrder(struct OrderBookLib.OrderBook self, address _user, uint48 _orderId) internal returns (enum ProtocolTypes.Side, uint256, uint256)
```

### calculateItayoseResult

```solidity
function calculateItayoseResult(struct OrderBookLib.OrderBook self) internal view returns (uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

### getOrderExecutionConditions

```solidity
function getOrderExecutionConditions(struct OrderBookLib.OrderBook self, enum ProtocolTypes.Side _side, uint256 _unitPrice, uint256 _circuitBreakerLimitRange, bool _isReadOnly) internal view returns (bool isFilled, uint256 executedUnitPrice, bool ignoreRemainingAmount, bool orderExists)
```

### getLendCircuitBreakerThreshold

```solidity
function getLendCircuitBreakerThreshold(struct OrderBookLib.OrderBook self, uint256 _circuitBreakerLimitRange, bool _isReadOnly) internal view returns (uint256 cbThresholdUnitPrice)
```

### getBorrowCircuitBreakerThreshold

```solidity
function getBorrowCircuitBreakerThreshold(struct OrderBookLib.OrderBook self, uint256 _circuitBreakerLimitRange, bool _isReadOnly) internal view returns (uint256 cbThresholdUnitPrice)
```

### _nextOrderId

```solidity
function _nextOrderId(struct OrderBookLib.OrderBook self) private returns (uint48)
```

Increases and returns id of last order in order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint48 | The new order id |

### _removeOrderIdFromOrders

```solidity
function _removeOrderIdFromOrders(uint48[] orders, uint256 orderId) private
```

### _packOrder

```solidity
function _packOrder(enum ProtocolTypes.Side _side, uint256 _unitPrice, uint256 _maturity, uint256 _timestamp) private pure returns (uint256)
```

Packs order parameters into uint256

### _unpackOrder

```solidity
function _unpackOrder(uint256 _order) private pure returns (enum ProtocolTypes.Side side, uint256 unitPrice, uint256 maturity, uint256 timestamp)
```

Unpacks order parameters from uint256

### _unpackBlockUnitPriceHistory

```solidity
function _unpackBlockUnitPriceHistory(uint80 _blockUnitPriceHistory) private pure returns (uint256[] prices)
```

