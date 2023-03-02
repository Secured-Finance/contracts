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

### getLendOrderBook

```solidity
function getLendOrderBook(uint256 _limit) public view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint256 _limit) public view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getOrder

```solidity
function getOrder(uint48 _orderId) public view returns (enum ProtocolTypes.Side side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp)
```

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(address _user) public view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(address _user) public view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

### getActiveLendOrderIds

```solidity
function getActiveLendOrderIds(address _user) public view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### getActiveBorrowOrderIds

```solidity
function getActiveBorrowOrderIds(address _user) public view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

### estimateFilledAmount

```solidity
function estimateFilledAmount(enum ProtocolTypes.Side _side, uint256 _futureValue) public view returns (uint256 amount)
```

### insertOrder

```solidity
function insertOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice, bool _isInterruption) public returns (uint48 orderId)
```

### dropOrders

```solidity
function dropOrders(enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) public returns (struct RemainingOrder remainingOrder, uint256 filledFutureValue, uint256 remainingAmount)
```

### cleanLendOrders

```solidity
function cleanLendOrders(address _user, uint256 _maturity) public returns (uint48[] orderIds, uint256 activeOrderCount, uint256 removedFutureValue, uint256 removedOrderAmount)
```

### cleanBorrowOrders

```solidity
function cleanBorrowOrders(address _user, uint256 _maturity) public returns (uint48[] orderIds, uint256 activeOrderCount, uint256 removedFutureValue, uint256 removedOrderAmount)
```

### removeOrder

```solidity
function removeOrder(address _user, uint48 _orderId) public returns (enum ProtocolTypes.Side, uint256, uint256)
```

### nextOrderId

```solidity
function nextOrderId() private returns (uint48)
```

Increases and returns id of last order in order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint48 | The new order id |

### removeOrderIdFromOrders

```solidity
function removeOrderIdFromOrders(uint48[] orders, uint256 orderId) private
```

