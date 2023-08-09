# Solidity API

## OrderBookLogic

### OrderBookCreated

```solidity
event OrderBookCreated(uint8 orderBookId, uint256 maturity, uint256 openingDate)
```

### ItayoseExecuted

```solidity
event ItayoseExecuted(bytes32 ccy, uint256 maturity, uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 offsetAmount)
```

### getOrderBookDetail

```solidity
function getOrderBookDetail(uint8 _orderBookId) public view returns (bytes32 ccy, uint256 maturity, uint256 openingDate, uint256 borrowUnitPrice, uint256 lendUnitPrice, uint256 midUnitPrice, uint256 openingUnitPrice, bool isReady)
```

### getCircuitBreakerThresholds

```solidity
function getCircuitBreakerThresholds(uint8 _orderBookId, uint256 _circuitBreakerLimitRange) external view returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
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

### getMidUnitPrice

```solidity
function getMidUnitPrice(uint8 _orderBookId) public view returns (uint256)
```

### getMidUnitPrices

```solidity
function getMidUnitPrices(uint8[] _orderBookIds) external view returns (uint256[] unitPrices)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint8 _orderBookId, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getLendOrderBook

```solidity
function getLendOrderBook(uint8 _orderBookId, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getMaturities

```solidity
function getMaturities(uint8[] _orderBookIds) public view returns (uint256[] maturities)
```

### createOrderBook

```solidity
function createOrderBook(uint256 _maturity, uint256 _openingDate) public returns (uint8 orderBookId)
```

### reopenOrderBook

```solidity
function reopenOrderBook(uint8 _orderBookId, uint256 _newMaturity, uint256 _openingDate) external
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

