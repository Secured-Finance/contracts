# Solidity API

## OrderBookLogic

### InvalidOrderFeeRate

```solidity
error InvalidOrderFeeRate()
```

### InvalidCircuitBreakerLimitRange

```solidity
error InvalidCircuitBreakerLimitRange()
```

### OrderBookNotMatured

```solidity
error OrderBookNotMatured()
```

### OrderFeeRateUpdated

```solidity
event OrderFeeRateUpdated(bytes32 ccy, uint256 previousRate, uint256 rate)
```

### CircuitBreakerLimitRangeUpdated

```solidity
event CircuitBreakerLimitRangeUpdated(bytes32 ccy, uint256 previousRate, uint256 rate)
```

### OrderBookCreated

```solidity
event OrderBookCreated(uint8 orderBookId, uint256 maturity, uint256 openingDate)
```

### ItayoseExecuted

```solidity
event ItayoseExecuted(bytes32 ccy, uint256 maturity, uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 offsetAmount)
```

### isReady

```solidity
function isReady(uint8 _orderBookId) public view returns (bool)
```

### isMatured

```solidity
function isMatured(uint8 _orderBookId) public view returns (bool)
```

### isOpened

```solidity
function isOpened(uint8 _orderBookId) public view returns (bool)
```

### isItayosePeriod

```solidity
function isItayosePeriod(uint8 _orderBookId) public view returns (bool)
```

### isPreOrderPeriod

```solidity
function isPreOrderPeriod(uint8 _orderBookId) public view returns (bool)
```

### getOrderBookDetail

```solidity
function getOrderBookDetail(uint8 _orderBookId) public view returns (bytes32 ccy, uint256 maturity, uint256 openingDate, uint256 preOpeningDate)
```

### getLastOrderTimestamp

```solidity
function getLastOrderTimestamp(uint8 _orderBookId) external view returns (uint48)
```

### getBlockUnitPriceHistory

```solidity
function getBlockUnitPriceHistory(uint8 _orderBookId) external view returns (uint256[] unitPrices, uint48 timestamp)
```

### getMarketUnitPrice

```solidity
function getMarketUnitPrice(uint8 _orderBookId) external view returns (uint256)
```

### getBlockUnitPriceAverage

```solidity
function getBlockUnitPriceAverage(uint8 _orderBookId, uint256 _count) external view returns (uint256)
```

### getCircuitBreakerThresholds

```solidity
function getCircuitBreakerThresholds(uint8 _orderBookId) external view returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
```

### getBestLendUnitPrice

```solidity
function getBestLendUnitPrice(uint8 _orderBookId) public view returns (uint256)
```

### getBestLendUnitPrices

```solidity
function getBestLendUnitPrices(uint8[] _orderBookIds) external view returns (uint256[] unitPrices)
```

### getBestBorrowUnitPrice

```solidity
function getBestBorrowUnitPrice(uint8 _orderBookId) public view returns (uint256)
```

### getBestBorrowUnitPrices

```solidity
function getBestBorrowUnitPrices(uint8[] _orderBookIds) external view returns (uint256[] unitPrices)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint8 _orderBookId, uint256 _start, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities, uint256 next)
```

### getLendOrderBook

```solidity
function getLendOrderBook(uint8 _orderBookId, uint256 _start, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities, uint256 next)
```

### getItayoseEstimation

```solidity
function getItayoseEstimation(uint8 _orderBookId) external view returns (uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

### getMaturities

```solidity
function getMaturities(uint8[] _orderBookIds) public view returns (uint256[] maturities)
```

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(uint256 _orderFeeRate) external
```

### updateCircuitBreakerLimitRange

```solidity
function updateCircuitBreakerLimitRange(uint256 _cbLimitRange) external
```

### createOrderBook

```solidity
function createOrderBook(uint256 _maturity, uint256 _openingDate, uint256 _preOpeningDate) public returns (uint8 orderBookId)
```

### executeAutoRoll

```solidity
function executeAutoRoll(uint8 _maturedOrderBookId, uint8 _destinationOrderBookId, uint256 _autoRollUnitPrice) external
```

### executeItayoseCall

```solidity
function executeItayoseCall(uint8 _orderBookId) external returns (uint256 openingUnitPrice, uint256 totalOffsetAmount, uint256 openingDate, struct PartiallyFilledOrder partiallyFilledLendingOrder, struct PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

### _nextOrderBookId

```solidity
function _nextOrderBookId() internal returns (uint8)
```

### _getOrderBook

```solidity
function _getOrderBook(uint8 _orderBookId) private view returns (struct OrderBookLib.OrderBook)
```

