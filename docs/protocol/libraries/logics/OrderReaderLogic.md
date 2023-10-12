# Solidity API

## OrderReaderLogic

### getOrder

```solidity
function getOrder(uint8 _orderBookId, uint48 _orderId) external view returns (enum ProtocolTypes.Side side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp, bool isPreOrder)
```

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(uint8 _orderBookId, address _user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(uint8 _orderBookId, address _user, uint256 _minUnitPrice) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getLendOrderIds

```solidity
function getLendOrderIds(uint8 _orderBookId, address _user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(uint8 _orderBookId, address _user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### calculateFilledAmount

```solidity
function calculateFilledAmount(uint8 _orderBookId, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount)
```

### calculateOrderFeeAmount

```solidity
function calculateOrderFeeAmount(uint256 _maturity, uint256 _amount) public view returns (uint256 orderFeeAmount)
```

### getLendOrderAmounts

```solidity
function getLendOrderAmounts(struct OrderBookLib.OrderBook orderBook, uint48 _orderId) public view returns (uint256 presentValue, uint256 futureValue)
```

### getBorrowOrderAmounts

```solidity
function getBorrowOrderAmounts(struct OrderBookLib.OrderBook orderBook, uint48 _orderId) public view returns (uint256 presentValue, uint256 futureValue, uint256 unitPrice)
```

### _getOrderUnitPrice

```solidity
function _getOrderUnitPrice(enum ProtocolTypes.Side _side, uint256 _maturity, uint256 _unitPrice, bool _isPreOrder) private view returns (uint256)
```

### _getOrderBook

```solidity
function _getOrderBook(uint8 _orderBookId) private view returns (struct OrderBookLib.OrderBook)
```

