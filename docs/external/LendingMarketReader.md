# Solidity API

## LendingMarketReader

### OrderBookDetail

```solidity
struct OrderBookDetail {
  bytes32 ccy;
  uint256 maturity;
  uint256 bestLendUnitPrice;
  uint256 bestBorrowUnitPrice;
  uint256 marketUnitPrice;
  uint256 lastOrderBlockNumber;
  uint256[] blockUnitPriceHistory;
  uint256 maxLendUnitPrice;
  uint256 minBorrowUnitPrice;
  uint256 openingUnitPrice;
  uint256 openingDate;
  uint256 preOpeningDate;
  bool isReady;
}
```

### Position

```solidity
struct Position {
  bytes32 ccy;
  uint256 maturity;
  int256 presentValue;
  int256 futureValue;
}
```

### Order

```solidity
struct Order {
  uint48 orderId;
  bytes32 ccy;
  uint256 maturity;
  enum ProtocolTypes.Side side;
  uint256 unitPrice;
  uint256 amount;
  uint256 timestamp;
  bool isPreOrder;
}
```

### constructor

```solidity
constructor(address _resolver) public
```

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### getBestLendUnitPrices

```solidity
function getBestLendUnitPrices(bytes32 _ccy) external view returns (uint256[])
```

Gets the best prices for lending in the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the best prices for lending |

### getBestBorrowUnitPrices

```solidity
function getBestBorrowUnitPrices(bytes32 _ccy) external view returns (uint256[])
```

Gets the best prices for borrowing in the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the best prices for borrowing |

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(bytes32 _ccy, uint256 _maturity, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of borrow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |
| _limit | uint256 | The limit number to get |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of borrow unit prices |
| amounts | uint256[] | The array of borrow order amounts |
| quantities | uint256[] | The array of borrow order quantities |

### getLendOrderBook

```solidity
function getLendOrderBook(bytes32 _ccy, uint256 _maturity, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of lend.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |
| _limit | uint256 | The limit number to get |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of borrow unit prices |
| amounts | uint256[] | The array of lend order amounts |
| quantities | uint256[] | The array of lend order quantities |

### getItayoseEstimation

```solidity
function getItayoseEstimation(bytes32 _ccy, uint256 _maturity) public view returns (uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

Gets the estimation of the Itayose process.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |

| Name | Type | Description |
| ---- | ---- | ----------- |
| openingUnitPrice | uint256 | The opening price when Itayose is executed |
| lastLendUnitPrice | uint256 | The price of the last lend order filled by Itayose. |
| lastBorrowUnitPrice | uint256 | The price of the last borrow order filled by Itayose. |
| totalOffsetAmount | uint256 | The total amount of the orders filled by Itayose. |

### getOrderBookDetails

```solidity
function getOrderBookDetails(bytes32[] _ccys) external view returns (struct LendingMarketReader.OrderBookDetail[] orderBookDetails)
```

Gets the array of detailed information on the order book

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccys | bytes32[] | Currency name list in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderBookDetails | struct LendingMarketReader.OrderBookDetail[] | The array of detailed information on the order book. |

### getOrderBookDetails

```solidity
function getOrderBookDetails(bytes32 _ccy) public view returns (struct LendingMarketReader.OrderBookDetail[] orderBookDetails)
```

Gets the array of detailed information on the order book

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderBookDetails | struct LendingMarketReader.OrderBookDetail[] | The array of detailed information on the order book. |

### getOrderBookDetail

```solidity
function getOrderBookDetail(bytes32 _ccy, uint256 _maturity) public view returns (struct LendingMarketReader.OrderBookDetail orderBookDetail)
```

Gets detailed information on the order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderBookDetail | struct LendingMarketReader.OrderBookDetail | The detailed information on the order book. |

### getPositions

```solidity
function getPositions(bytes32[] _ccys, address _user) external view returns (struct LendingMarketReader.Position[] positions)
```

Gets user's active positions of the selected currencies.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccys | bytes32[] | Currency name list in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| positions | struct LendingMarketReader.Position[] | The array of active positions |

### getPositions

```solidity
function getPositions(bytes32 _ccy, address _user) public view returns (struct LendingMarketReader.Position[] positions)
```

Gets user's active positions of the selected currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| positions | struct LendingMarketReader.Position[] | The array of active positions |

### getOrders

```solidity
function getOrders(bytes32[] _ccys, address _user) external view returns (struct LendingMarketReader.Order[] activeOrders, struct LendingMarketReader.Order[] inactiveOrders)
```

Gets user's active and inactive orders in the order book

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccys | bytes32[] | Currency name list in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeOrders | struct LendingMarketReader.Order[] | The array of active orders in the order book |
| inactiveOrders | struct LendingMarketReader.Order[] | The array of inactive orders |

### getOrders

```solidity
function getOrders(bytes32 _ccy, address _user) public view returns (struct LendingMarketReader.Order[] activeOrders, struct LendingMarketReader.Order[] inactiveOrders)
```

Gets user's active and inactive orders in the order book by currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeOrders | struct LendingMarketReader.Order[] | The array of active orders in the order book |
| inactiveOrders | struct LendingMarketReader.Order[] | The array of inactive orders |

### getOrders

```solidity
function getOrders(bytes32 _ccy, uint256 _maturity, address _user) public view returns (struct LendingMarketReader.Order[] activeOrders, struct LendingMarketReader.Order[] inactiveOrders)
```

Gets user's active and inactive orders in the order book by maturity

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeOrders | struct LendingMarketReader.Order[] | The array of active orders in the order book |
| inactiveOrders | struct LendingMarketReader.Order[] | The array of inactive orders |

### _getOrder

```solidity
function _getOrder(bytes32 _ccy, contract ILendingMarket _market, uint8 _orderBookId, uint48 _orderId) internal view returns (struct LendingMarketReader.Order order)
```

### _getLendingMarket

```solidity
function _getLendingMarket(bytes32 _ccy) internal view returns (contract ILendingMarket)
```

### _flattenOrders

```solidity
function _flattenOrders(struct LendingMarketReader.Order[][] orders, uint256 totalLength) internal pure returns (struct LendingMarketReader.Order[] flattened)
```

