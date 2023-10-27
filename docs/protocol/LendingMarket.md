# Solidity API

## LendingMarket

Implements the module that allows order book participants to execute/cancel/unwind orders.

For updates, this contract is basically called from `LendingMarketController.sol`instead of being called
directly by the user.

_Open orders is stored in structured red-black trees and doubly linked lists in each node._

### MINIMUM_RELIABLE_AMOUNT_IN_BASE_CURRENCY

```solidity
uint256 MINIMUM_RELIABLE_AMOUNT_IN_BASE_CURRENCY
```

_Used for minimum reliable amount in base currency for block unit price_

### onlyMaker

```solidity
modifier onlyMaker(uint8 _orderBookId, address _user, uint48 _orderId)
```

Modifier to make a function callable only by order maker.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _user | address | User's address |
| _orderId | uint48 | Market order id |

### ifOpened

```solidity
modifier ifOpened(uint8 _orderBookId)
```

Modifier to check if the market is opened.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

### ifItayosePeriod

```solidity
modifier ifItayosePeriod(uint8 _orderBookId)
```

Modifier to check if the market is under the Itayose period.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

### ifPreOrderPeriod

```solidity
modifier ifPreOrderPeriod(uint8 _orderBookId)
```

Modifier to check if the market is under the pre-order period.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

### constructor

```solidity
constructor(uint256 _minimumReliableAmount) public
```

Contract constructor function.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minimumReliableAmount | uint256 | The minimum reliable amount the base currency for calculating block unit price |

### initialize

```solidity
function initialize(address _resolver, bytes32 _ccy, uint256 _orderFeeRate, uint256 _cbLimitRange) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |
| _ccy | bytes32 | The main currency for the order book |
| _orderFeeRate | uint256 |  |
| _cbLimitRange | uint256 |  |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### acceptedContracts

```solidity
function acceptedContracts() public pure returns (bytes32[] contracts)
```

Returns contract names that can call this contract.

_The contact name listed in this method is also needed to be listed `requiredContracts` method._

### isReady

```solidity
function isReady(uint8 _orderBookId) public view returns (bool)
```

Gets if the market is ready.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is ready or not |

### isMatured

```solidity
function isMatured(uint8 _orderBookId) public view returns (bool)
```

Gets if the market is matured.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is matured or not |

### isOpened

```solidity
function isOpened(uint8 _orderBookId) public view returns (bool)
```

Gets if the market is opened.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is opened or not |

### isItayosePeriod

```solidity
function isItayosePeriod(uint8 _orderBookId) public view returns (bool)
```

Gets if the market is under the Itayose period.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is under the Itayose period. |

### isPreOrderPeriod

```solidity
function isPreOrderPeriod(uint8 _orderBookId) public view returns (bool)
```

Gets if the market is under the pre-order period.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is under the pre-order period. |

### getOrderBookDetail

```solidity
function getOrderBookDetail(uint8 _orderBookId) public view returns (bytes32 ccy, uint256 maturity, uint256 openingDate, uint256 preOpeningDate)
```

Gets the order book detail.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| ccy | bytes32 | The currency of the order book |
| maturity | uint256 | The maturity of the order book |
| openingDate | uint256 | The opening date of the order book |
| preOpeningDate | uint256 | The pre-opening date of the order book |

### getCircuitBreakerThresholds

```solidity
function getCircuitBreakerThresholds(uint8 _orderBookId) external view returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
```

Gets unit price Thresholds by CircuitBreaker.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| maxLendUnitPrice | uint256 | The maximum unit price for lending |
| minBorrowUnitPrice | uint256 | The minimum unit price for borrowing |

### getBestLendUnitPrice

```solidity
function getBestLendUnitPrice(uint8 _orderBookId) public view returns (uint256)
```

Gets the best price for lending.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The best price for lending |

### getBestLendUnitPrices

```solidity
function getBestLendUnitPrices(uint8[] _orderBookIds) external view returns (uint256[])
```

Gets the best prices for lending.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | The array of the best price for lending |

### getBestBorrowUnitPrice

```solidity
function getBestBorrowUnitPrice(uint8 _orderBookId) public view returns (uint256)
```

Gets the best price for borrowing.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The best price for borrowing |

### getBestBorrowUnitPrices

```solidity
function getBestBorrowUnitPrices(uint8[] _orderBookIds) external view returns (uint256[])
```

Gets the best prices for borrowing.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | The array of the best price for borrowing |

### getMarketUnitPrice

```solidity
function getMarketUnitPrice(uint8 _orderBookId) external view returns (uint256)
```

Gets the market unit price

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The market unit price |

### getLastOrderBlockNumber

```solidity
function getLastOrderBlockNumber(uint8 _orderBookId) external view returns (uint256)
```

Gets the block number of the last filled order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The block number |

### getBlockUnitPriceHistory

```solidity
function getBlockUnitPriceHistory(uint8 _orderBookId) external view returns (uint256[])
```

Gets the block unit price history

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | The array of the block unit price |

### getBlockUnitPriceAverage

```solidity
function getBlockUnitPriceAverage(uint8 _orderBookId, uint256 _count) external view returns (uint256)
```

Gets the block unit price average.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _count | uint256 | Count of data used for averaging |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The block unit price average |

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint8 _orderBookId, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of borrow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _limit | uint256 | Max limit to get unit prices |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of borrow unit prices |
| amounts | uint256[] |  |
| quantities | uint256[] |  |

### getLendOrderBook

```solidity
function getLendOrderBook(uint8 _orderBookId, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of lend.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _limit | uint256 | Max limit to get unit prices |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of lending unit prices |
| amounts | uint256[] |  |
| quantities | uint256[] |  |

### getItayoseEstimation

```solidity
function getItayoseEstimation(uint8 _orderBookId) external view returns (uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

Gets the estimation of the Itayose process.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| openingUnitPrice | uint256 | The opening price when Itayose is executed |
| lastLendUnitPrice | uint256 | The price of the last lend order filled by Itayose. |
| lastBorrowUnitPrice | uint256 | The price of the last borrow order filled by Itayose. |
| totalOffsetAmount | uint256 | The total amount of the orders filled by Itayose. |

### getMaturity

```solidity
function getMaturity(uint8 _orderBookId) public view returns (uint256 maturity)
```

Gets the current market maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| maturity | uint256 | The market maturity |

### getMaturities

```solidity
function getMaturities(uint8[] _orderBookIds) external view returns (uint256[] maturities)
```

Gets the order book maturities.

| Name | Type | Description |
| ---- | ---- | ----------- |
| maturities | uint256[] | The array of maturity |

### getCurrency

```solidity
function getCurrency() external view returns (bytes32 currency)
```

Gets the market currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| currency | bytes32 | The market currency |

### getOrderFeeRate

```solidity
function getOrderFeeRate() external view returns (uint256)
```

Gets the order fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The order fee rate received by protocol |

### getCircuitBreakerLimitRange

```solidity
function getCircuitBreakerLimitRange() external view returns (uint256)
```

Gets the limit range in unit price for the circuit breaker

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The limit range in unit price for the circuit breaker |

### getOpeningDate

```solidity
function getOpeningDate(uint8 _orderBookId) public view returns (uint256 openingDate)
```

Gets the market opening date.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| openingDate | uint256 | The market opening date |

### getItayoseLog

```solidity
function getItayoseLog(uint256 _maturity) external view returns (struct ItayoseLog)
```

Gets the market itayose logs.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The market maturity |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ItayoseLog | ItayoseLog of the market |

### getOrder

```solidity
function getOrder(uint8 _orderBookId, uint48 _orderId) public view returns (enum ProtocolTypes.Side side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp, bool isPreOrder)
```

Gets the market order from the order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _orderId | uint48 | The market order id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| unitPrice | uint256 | Amount of interest unit price |
| maturity | uint256 | The maturity of the selected order |
| maker | address | The order maker |
| amount | uint256 | Order amount |
| timestamp | uint256 | Timestamp when the order was created |
| isPreOrder | bool | The boolean if the order is a pre-order. |

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(uint8 _orderBookId, address _user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

Calculates and gets the active and inactive amounts from the user orders of lending deals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeAmount | uint256 | The total amount of active order on the order book |
| inactiveAmount | uint256 | The total amount of inactive orders filled on the order book |
| inactiveFutureValue | uint256 | The total future value amount of inactive orders filled on the order book |
| maturity | uint256 | The maturity of market that orders were placed. |

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(uint8 _orderBookId, address _user, uint256 _minUnitPrice) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

Calculates and gets the active and inactive amounts from the user orders of borrowing deals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _user | address | User's address |
| _minUnitPrice | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeAmount | uint256 | The total amount of active order on the order book |
| inactiveAmount | uint256 | The total amount of inactive orders filled on the order book |
| inactiveFutureValue | uint256 | The total future value amount of inactive orders filled on the order book |
| maturity | uint256 | The maturity of market that orders were placed. |

### getLendOrderIds

```solidity
function getLendOrderIds(uint8 _orderBookId, address _user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

Gets active and inactive order IDs in the lending order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _user | address | User's address |

### getBorrowOrderIds

```solidity
function getBorrowOrderIds(uint8 _orderBookId, address _user) external view returns (uint48[] activeOrderIds, uint48[] inActiveOrderIds)
```

Gets active and inactive order IDs in the borrowing order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _user | address | User's address |

### calculateFilledAmount

```solidity
function calculateFilledAmount(uint8 _orderBookId, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount)
```

Calculates the amount to be filled when executing an order in the order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the user wants to borrow/lend |
| _unitPrice | uint256 | Unit price user want to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| lastUnitPrice | uint256 | The last unit price that is filled on the order book |
| filledAmount | uint256 | The amount that is filled on the order book |
| filledAmountInFV | uint256 | The amount in the future value that is filled on the order book |
| orderFeeInFV | uint256 | The order fee amount in the future value |
| placedAmount | uint256 | The amount that is placed to the order book |

### createOrderBook

```solidity
function createOrderBook(uint256 _maturity, uint256 _openingDate, uint256 _preOpeningDate) external returns (uint8 orderBookId)
```

Creates a new order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The initial maturity of the order book |
| _openingDate | uint256 | The timestamp when the order book opens |
| _preOpeningDate | uint256 | The timestamp when the order book pre-opens |

### executeAutoRoll

```solidity
function executeAutoRoll(uint8 _maturedOrderBookId, uint8 _newNearestOrderBookId, uint256 _newMaturity, uint256 _openingDate, uint256 _autoRollUnitPrice) external
```

### cancelOrder

```solidity
function cancelOrder(uint8 _orderBookId, address _user, uint48 _orderId) external
```

Cancels the order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _user | address | User address |
| _orderId | uint48 | Market order id |

### cleanUpOrders

```solidity
function cleanUpOrders(uint8 _orderBookId, address _user) external returns (uint256 activeLendOrderCount, uint256 activeBorrowOrderCount, uint256 removedLendOrderFutureValue, uint256 removedBorrowOrderFutureValue, uint256 removedLendOrderAmount, uint256 removedBorrowOrderAmount, uint256 maturity)
```

Cleans up own orders to remove order ids that are already filled on the order book.

_The order list per user is not updated in real-time when an order is filled.
This function removes the filled order from that order list per user to reduce gas costs
for lazy evaluation if the collateral is enough or not._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeLendOrderCount | uint256 | The total amount of active lend order on the order book |
| activeBorrowOrderCount | uint256 | The total amount of active borrow order on the order book |
| removedLendOrderFutureValue | uint256 | The total FV amount of the removed lend order amount from the order book |
| removedBorrowOrderFutureValue | uint256 | The total FV amount of the removed borrow order amount from the order book |
| removedLendOrderAmount | uint256 | The total PV amount of the removed lend order amount from the order book |
| removedBorrowOrderAmount | uint256 | The total PV amount of the removed borrow order amount from the order book |
| maturity | uint256 | The maturity of the removed orders |

### executeOrder

```solidity
function executeOrder(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice) external returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV)
```

Executes an order. Takes orders if the order is matched,
and places new order if not match it.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the user wants to borrow/lend |
| _unitPrice | uint256 | Unit price user wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| filledOrder | struct FilledOrder | User's Filled order of the user |
| partiallyFilledOrder | struct PartiallyFilledOrder | Partially filled order on the order book |
| feeInFV | uint256 |  |

### executePreOrder

```solidity
function executePreOrder(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice) external
```

Executes a pre-order. A pre-order will only be accepted from 168 hours (7 days) to 1 hour
before the market opens (Pre-order period). At the end of this period, Itayose will be executed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address |  |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Unit price taker wish to borrow/lend |

### unwindPosition

```solidity
function unwindPosition(uint8 _orderBookId, enum ProtocolTypes.Side _side, address _user, uint256 _futureValue) external returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV)
```

Unwinds lending or borrowing positions by a specified future value amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _futureValue | uint256 | Amount of future value unwound |

| Name | Type | Description |
| ---- | ---- | ----------- |
| filledOrder | struct FilledOrder | User's Filled order of the user |
| partiallyFilledOrder | struct PartiallyFilledOrder | Partially filled order |
| feeInFV | uint256 |  |

### executeItayoseCall

```solidity
function executeItayoseCall(uint8 _orderBookId) external returns (uint256 openingUnitPrice, uint256 totalOffsetAmount, uint256 openingDate, struct PartiallyFilledOrder partiallyFilledLendingOrder, struct PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

Executes Itayose to aggregate pre-orders and determine the opening unit price.
After this action, the market opens.

_If the opening date had already passed when this contract was created, this Itayose need not be executed._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| openingUnitPrice | uint256 | The opening price when Itayose is executed |
| totalOffsetAmount | uint256 | The total filled amount when Itayose is executed |
| openingDate | uint256 | The timestamp when the market opens |
| partiallyFilledLendingOrder | struct PartiallyFilledOrder | Partially filled lending order on the order book |
| partiallyFilledBorrowingOrder | struct PartiallyFilledOrder | Partially filled borrowing order on the order book |

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(uint256 _orderFeeRate) external
```

Updates the order fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderFeeRate | uint256 | The order fee rate received by protocol |

### updateCircuitBreakerLimitRange

```solidity
function updateCircuitBreakerLimitRange(uint256 _cbLimitRange) external
```

Updates the auto-roll fee rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| _cbLimitRange | uint256 | The circuit breaker limit range |

### pause

```solidity
function pause() external
```

Pauses the lending market.

### unpause

```solidity
function unpause() external
```

Unpauses the lending market.

