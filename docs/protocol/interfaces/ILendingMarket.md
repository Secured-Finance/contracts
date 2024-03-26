# Solidity API

## ILendingMarket

### NoOrderExists

```solidity
error NoOrderExists()
```

### CallerNotMaker

```solidity
error CallerNotMaker()
```

### MarketNotOpened

```solidity
error MarketNotOpened()
```

### AlreadyItayosePeriod

```solidity
error AlreadyItayosePeriod()
```

### NotItayosePeriod

```solidity
error NotItayosePeriod()
```

### NotPreOrderPeriod

```solidity
error NotPreOrderPeriod()
```

### getOrderBookDetail

```solidity
function getOrderBookDetail(uint8 orderBookId) external view returns (bytes32 ccy, uint256 maturity, uint256 openingDate, uint256 preOpeningDate)
```

### getCircuitBreakerThresholds

```solidity
function getCircuitBreakerThresholds(uint8 orderBookId) external view returns (uint256 lendCircuitBreakerThreshold, uint256 borrowCircuitBreakerThreshold)
```

### getBestLendUnitPrice

```solidity
function getBestLendUnitPrice(uint8 orderBookId) external view returns (uint256 unitPrice)
```

### getBestLendUnitPrices

```solidity
function getBestLendUnitPrices(uint8[] orderBookIds) external view returns (uint256[])
```

### getBestBorrowUnitPrice

```solidity
function getBestBorrowUnitPrice(uint8 orderBookId) external view returns (uint256 unitPrice)
```

### getBestBorrowUnitPrices

```solidity
function getBestBorrowUnitPrices(uint8[] orderBookIds) external view returns (uint256[])
```

### getMarketUnitPrice

```solidity
function getMarketUnitPrice(uint8 orderBookId) external view returns (uint256)
```

### getLastOrderTimestamp

```solidity
function getLastOrderTimestamp(uint8 orderBookId) external view returns (uint48)
```

### getBlockUnitPriceHistory

```solidity
function getBlockUnitPriceHistory(uint8 orderBookId) external view returns (uint256[] unitPrices, uint48 timestamp)
```

### getBlockUnitPriceAverage

```solidity
function getBlockUnitPriceAverage(uint8 orderBookId, uint256 count) external view returns (uint256)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint8 orderBookId, uint256 start, uint256 limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities, uint256 next)
```

### getLendOrderBook

```solidity
function getLendOrderBook(uint8 orderBookId, uint256 start, uint256 limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities, uint256 next)
```

### getItayoseEstimation

```solidity
function getItayoseEstimation(uint8 orderBookId) external view returns (uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

### getMaturity

```solidity
function getMaturity(uint8 orderBookId) external view returns (uint256)
```

### getMaturities

```solidity
function getMaturities(uint8[] orderBookIds) external view returns (uint256[] maturities)
```

### getCurrency

```solidity
function getCurrency() external view returns (bytes32)
```

### getOrderFeeRate

```solidity
function getOrderFeeRate() external view returns (uint256)
```

### getCircuitBreakerLimitRange

```solidity
function getCircuitBreakerLimitRange() external view returns (uint256)
```

### getOpeningDate

```solidity
function getOpeningDate(uint8 orderBookId) external view returns (uint256)
```

### isReady

```solidity
function isReady(uint8 orderBookId) external view returns (bool)
```

### isMatured

```solidity
function isMatured(uint8 orderBookId) external view returns (bool)
```

### isOpened

```solidity
function isOpened(uint8 orderBookId) external view returns (bool)
```

### isItayosePeriod

```solidity
function isItayosePeriod(uint8 orderBookId) external view returns (bool)
```

### isPreOrderPeriod

```solidity
function isPreOrderPeriod(uint8 orderBookId) external returns (bool)
```

### getItayoseLog

```solidity
function getItayoseLog(uint256 maturity) external view returns (struct ItayoseLog)
```

### getOrder

```solidity
function getOrder(uint8 orderBookId, uint48 orderId) external view returns (enum ProtocolTypes.Side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp, bool isPreOrder)
```

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(uint8 orderBookId, address user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(uint8 orderBookId, address user, uint256 _minUnitPrice) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getLendOrderIds

```solidity
function getLendOrderIds(uint8 orderBookId, address user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(uint8 orderBookId, address user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### calculateFilledAmount

```solidity
function calculateFilledAmount(uint8 orderBookId, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 feeInFV, uint256 placedAmount)
```

### createOrderBook

```solidity
function createOrderBook(uint256 maturity, uint256 openingDate, uint256 preOpeningDate) external returns (uint8 orderBookId)
```

### executeAutoRoll

```solidity
function executeAutoRoll(uint8 maturedOrderBookId, uint8 newNearestOrderBookId, uint256 autoRollUnitPrice) external
```

### cancelOrder

```solidity
function cancelOrder(uint8 orderBookId, address user, uint48 orderId) external
```

### executeOrder

```solidity
function executeOrder(uint8 orderBookId, enum ProtocolTypes.Side side, address account, uint256 amount, uint256 unitPrice) external returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV)
```

### executePreOrder

```solidity
function executePreOrder(uint8 orderBookId, enum ProtocolTypes.Side side, address user, uint256 amount, uint256 unitPrice) external
```

### unwindPosition

```solidity
function unwindPosition(uint8 orderBookId, enum ProtocolTypes.Side side, address user, uint256 futureValue) external returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV)
```

### executeItayoseCall

```solidity
function executeItayoseCall(uint8 orderBookId) external returns (uint256 openingUnitPrice, uint256 totalOffsetAmount, uint256 openingDate, struct PartiallyFilledOrder partiallyFilledLendingOrder, struct PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

### cleanUpOrders

```solidity
function cleanUpOrders(uint8 orderBookId, address user) external returns (uint256 activeLendOrderCount, uint256 activeBorrowOrderCount, uint256 removedLendOrderFutureValue, uint256 removedBorrowOrderFutureValue, uint256 removedLendOrderAmount, uint256 removedBorrowOrderAmount, uint256 maturity)
```

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(uint256 orderFeeRate) external
```

### updateCircuitBreakerLimitRange

```solidity
function updateCircuitBreakerLimitRange(uint256 limitRange) external
```

### pause

```solidity
function pause() external
```

### unpause

```solidity
function unpause() external
```

