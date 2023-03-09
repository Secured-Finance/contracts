# Solidity API

## LendingMarket

Implements the module that allows lending market participants to create/cancel market orders,
and also provides a future value calculation module.

For updates, this contract is basically called from `LendingMarketController.sol`instead of being called \
directly by the user.

_The market orders is stored in structured red-black trees and doubly linked lists in each node._

### PRE_ORDER_PERIOD

```solidity
uint256 PRE_ORDER_PERIOD
```

### ITAYOSE_PERIOD

```solidity
uint256 ITAYOSE_PERIOD
```

### onlyMaker

```solidity
modifier onlyMaker(address user, uint48 _orderId)
```

Modifier to make a function callable only by order maker.

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address |  |
| _orderId | uint48 | Market order id |

### ifOpened

```solidity
modifier ifOpened()
```

Modifier to check if the market is opened.

### ifMatured

```solidity
modifier ifMatured()
```

Modifier to check if the market is matured.

### ifItayosePeriod

```solidity
modifier ifItayosePeriod()
```

### ifPreOrderPeriod

```solidity
modifier ifPreOrderPeriod()
```

### initialize

```solidity
function initialize(address _resolver, bytes32 _ccy, uint256 _maturity, uint256 _openingDate) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |
| _ccy | bytes32 | The main currency for the order book |
| _maturity | uint256 | The initial maturity of the market |
| _openingDate | uint256 | The timestamp when the market opens |

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

### getMarket

```solidity
function getMarket() external view returns (struct ILendingMarket.Market market)
```

Gets the market data.

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | struct ILendingMarket.Market | The market data |

### getBorrowUnitPrice

```solidity
function getBorrowUnitPrice() external view returns (uint256)
```

Gets the highest borrow price per future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The highest borrow price per future value |

### getLendUnitPrice

```solidity
function getLendUnitPrice() external view returns (uint256)
```

Gets the lowest lend price per future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The lowest lend price per future value |

### getMidUnitPrice

```solidity
function getMidUnitPrice() public view returns (uint256)
```

Gets the mid price per future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The mid price per future value |

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of borrow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _limit | uint256 | Max limit to get unit prices |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of borrow unit prices |
| amounts | uint256[] |  |
| quantities | uint256[] |  |

### getLendOrderBook

```solidity
function getLendOrderBook(uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of lend.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _limit | uint256 | Max limit to get unit prices |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of lending unit prices |
| amounts | uint256[] |  |
| quantities | uint256[] |  |

### getMaturity

```solidity
function getMaturity() external view returns (uint256 maturity)
```

Gets the current market maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| maturity | uint256 | The market maturity |

### getCurrency

```solidity
function getCurrency() external view returns (bytes32 currency)
```

Gets the market currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| currency | bytes32 | The market currency |

### getOpeningDate

```solidity
function getOpeningDate() external view returns (uint256)
```

### getOpeningUnitPrice

```solidity
function getOpeningUnitPrice() external view returns (uint256)
```

### isMatured

```solidity
function isMatured() public view returns (bool)
```

Gets if the market is matured.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is matured or not |

### isOpened

```solidity
function isOpened() public view returns (bool)
```

Gets if the market is opened.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the market is opened or not |

### isItayosePeriod

```solidity
function isItayosePeriod() public view returns (bool)
```

### isPreOrderPeriod

```solidity
function isPreOrderPeriod() public view returns (bool)
```

### getOrder

```solidity
function getOrder(uint48 _orderId) public view returns (enum ProtocolTypes.Side side, uint256 unitPrice, uint256 maturity, address maker, uint256 amount, uint256 timestamp)
```

Gets the market order from the order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderId | uint48 | The market order id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| unitPrice | uint256 | Amount of interest unit price |
| maturity | uint256 | The maturity of the selected order |
| maker | address | The order maker |
| amount | uint256 | Order amount |
| timestamp | uint256 | Timestamp when the order was created |

### getTotalAmountFromLendOrders

```solidity
function getTotalAmountFromLendOrders(address _user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

Calculates and gets the active and inactive amounts from the user orders of lending deals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeAmount | uint256 | The total amount of active order on the order book |
| inactiveAmount | uint256 | The total amount of inactive orders filled on the order book |
| inactiveFutureValue | uint256 | The total future value amount of inactive orders filled on the order book |
| maturity | uint256 | The maturity of market that orders were placed. |

### getTotalAmountFromBorrowOrders

```solidity
function getTotalAmountFromBorrowOrders(address _user) external view returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue, uint256 maturity)
```

Calculates and gets the active and inactive amounts from the user orders of borrowing deals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeAmount | uint256 | The total amount of active order on the order book |
| inactiveAmount | uint256 | The total amount of inactive orders filled on the order book |
| inactiveFutureValue | uint256 | The total future value amount of inactive orders filled on the order book |
| maturity | uint256 | The maturity of market that orders were placed. |

### getActiveLendOrderIds

```solidity
function getActiveLendOrderIds(address _user) external view returns (uint48[] activeOrderIds)
```

Gets the order ids of active lending order on the order book

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### getActiveBorrowOrderIds

```solidity
function getActiveBorrowOrderIds(address _user) external view returns (uint48[] activeOrderIds)
```

Gets the order ids of active borrowing order on the order book

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### estimateFilledAmount

```solidity
function estimateFilledAmount(enum ProtocolTypes.Side _side, uint256 _futureValue) external view returns (uint256 amount)
```

Estimates the filled amount at the time of order creation on the order book
using the future value amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _futureValue | uint256 | Future value amount |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The estimated amount in the present value that is filled on the order book |

### openMarket

```solidity
function openMarket(uint256 _maturity, uint256 _openingDate) external returns (uint256 prevMaturity)
```

Opens market

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The new maturity |
| _openingDate | uint256 | The timestamp when the market opens |

| Name | Type | Description |
| ---- | ---- | ----------- |
| prevMaturity | uint256 | The previous maturity updated |

### cancelOrder

```solidity
function cancelOrder(address _user, uint48 _orderId) external returns (enum ProtocolTypes.Side side, uint256 removedAmount, uint256 unitPrice)
```

Cancels the order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User address |
| _orderId | uint48 | Market order id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| side | enum ProtocolTypes.Side | The canceled order position type |
| removedAmount | uint256 | The removed order amount from the order book by canceling |
| unitPrice | uint256 | The canceled order unit price |

### cleanOrders

```solidity
function cleanOrders(address _user) external returns (uint256 activeLendOrderCount, uint256 activeBorrowOrderCount, uint256 removedLendOrderFutureValue, uint256 removedBorrowOrderFutureValue, uint256 removedLendOrderAmount, uint256 removedBorrowOrderAmount, uint256 maturity)
```

Cleans own orders to remove order ids that are already filled on the order book.

_The order list per user is not updated in real-time when an order is filled.
This function removes the filled order from that order list per user to reduce gas costs
for calculating if the collateral is enough or not._

| Name | Type | Description |
| ---- | ---- | ----------- |
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

### createOrder

```solidity
function createOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice, bool _ignoreRemainingAmount) external returns (uint256 filledFutureValue, uint256 remainingAmount)
```

Creates the order. Takes the order if the order is matched,
and places new order if not match it.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |
| _ignoreRemainingAmount | bool | Boolean for whether to ignore the remaining amount after taking orders |

| Name | Type | Description |
| ---- | ---- | ----------- |
| filledFutureValue | uint256 | The total FV amount of the filled order amount on the order book |
| remainingAmount | uint256 | The remaining amount that is not filled in the order book |

### createPreOrder

```solidity
function createPreOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice) external
```

Creates a pre-order. A pre-order will only be accepted from 48 hours to 1 hour
before the market opens (Pre-order period). At the end of this period, Itayose will be executed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address |  |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

### executeItayoseCall

```solidity
function executeItayoseCall() external
```

Executes Itayose to aggregate pre-orders and determine the opening unit price.
After this action, the market opens.

_If the opening date had already passed when this contract was created, this Itayose need not be executed._

### pauseMarket

```solidity
function pauseMarket() external
```

Pauses the lending market.

### unpauseMarket

```solidity
function unpauseMarket() external
```

Unpauses the lending market.

### _updateUserMaturity

```solidity
function _updateUserMaturity(address _user) private
```

### _makeOrder

```solidity
function _makeOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice, bool _isInterruption, uint48 _originalOrderId) private returns (uint48 orderId)
```

Makes new market order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Preferable interest unit price |
| _isInterruption | bool |  |
| _originalOrderId | uint48 | The original order id that filled partially |

### _takeOrder

```solidity
function _takeOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _unitPrice, bool _ignoreRemainingAmount) private returns (uint256 filledFutureValue, uint256 remainingAmount)
```

Takes the market order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taken |
| _ignoreRemainingAmount | bool | Boolean for whether to ignore the remaining amount after taking orders |

