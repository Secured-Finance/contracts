# Solidity API

## LendingMarket

Implements the module that allows lending market participants to create/cancel market orders,
and provides the calculation module of future value by inheriting `MixinFutureValue.sol`.
For updating, this contract is basically called from the `LendingMarketController.sol`,
not called directly from users.

_The market orders is stored in structured red-black trees and doubly linked lists in each node._

### onlyMaker

```solidity
modifier onlyMaker(address account, uint256 _orderId)
```

Modifier to make a function callable only by order maker.

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address |  |
| _orderId | uint256 | Market order id |

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

### initialize

```solidity
function initialize(address _resolver, bytes32 _ccy, uint256 _maturity, uint256 _basisDate) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |
| _ccy | bytes32 | The main currency for the order book |
| _maturity | uint256 | The initial maturity of the market |
| _basisDate | uint256 | The basis date when the first market open |

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

### getMaker

```solidity
function getMaker(uint256 _orderId) public view returns (address maker)
```

Gets the order maker address.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderId | uint256 | The market order id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| maker | address | The order maker address |

### getMarket

```solidity
function getMarket() external view returns (struct ILendingMarket.Market market)
```

Gets the market data.

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | struct ILendingMarket.Market | The market data |

### getBorrowRate

```solidity
function getBorrowRate() public view returns (uint256 rate)
```

Gets the highest borrow rate.

| Name | Type | Description |
| ---- | ---- | ----------- |
| rate | uint256 | The highest borrow rate |

### getLendRate

```solidity
function getLendRate() public view returns (uint256 rate)
```

Gets the highest lend rate.

| Name | Type | Description |
| ---- | ---- | ----------- |
| rate | uint256 | The highest lend rate |

### getMidRate

```solidity
function getMidRate() public view returns (uint256 rate)
```

Gets mid rate.

| Name | Type | Description |
| ---- | ---- | ----------- |
| rate | uint256 | The mid rate |

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

### getOrder

```solidity
function getOrder(uint256 _orderId) external view returns (struct MarketOrder order)
```

Gets the market order information.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderId | uint256 | The market order id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct MarketOrder | The market order information |

### getOrderFromTree

```solidity
function getOrderFromTree(uint256 _maturity, uint256 _orderId) external view returns (uint256, uint256, uint256, uint256, uint256)
```

Gets the market order from the order book in the maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The maturity of the order book |
| _orderId | uint256 | The market order id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | order The market order information |
| [1] | uint256 |  |
| [2] | uint256 |  |
| [3] | uint256 |  |
| [4] | uint256 |  |

### futureValueOf

```solidity
function futureValueOf(address _user) public view returns (int256)
```

Gets the future value in the latest maturity the user has.

If the market is rotated, the maturity in the market is updated, so the existing future value
is addressed as an old future value in old maturity.
This method doesn't return those old future values.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The future value in latest maturity |

### presentValueOf

```solidity
function presentValueOf(address _user) external view returns (int256)
```

Gets the present value calculated from the future value & market rate.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The present value |

### nextOrderId

```solidity
function nextOrderId() internal returns (uint256)
```

Increases and returns id of last order in order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The new order id |

### openMarket

```solidity
function openMarket(uint256 _maturity) external returns (uint256 prevMaturity)
```

Opens market

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The new maturity |

### cancelOrder

```solidity
function cancelOrder(address _user, uint256 _orderId) public returns (uint256)
```

Cancels the order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User address |
| _orderId | uint256 | Market order id |

### makeOrder

```solidity
function makeOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _rate) internal returns (uint256 orderId)
```

Makes new market order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _rate | uint256 | Preferable interest rate |

### takeOrder

```solidity
function takeOrder(enum ProtocolTypes.Side _side, address _user, uint256 _orderId, uint256 _amount) internal returns (address)
```

Takes the market order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _orderId | uint256 | Market order id in the order book |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |

### matchOrders

```solidity
function matchOrders(enum ProtocolTypes.Side _side, uint256 _amount, uint256 _rate) external view returns (uint256)
```

Gets if the market order will be matched or not.

Returns zero if there is not a matched order.
Reverts if no orders for specified interest rate.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _rate | uint256 | Amount of interest rate taker wish to borrow/lend |

### createOrder

```solidity
function createOrder(enum ProtocolTypes.Side _side, address _user, uint256 _amount, uint256 _rate) external returns (address maker, uint256 amount)
```

Creates the order. Takes the order if the order is matched,
and places new order if not match it.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _user | address | User's address |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _rate | uint256 | Amount of interest rate taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| maker | address | The maker address |
| amount | uint256 | The taken amount |

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

### removeFutureValueInPastMaturity

```solidity
function removeFutureValueInPastMaturity(address _user) external returns (int256 removedAmount, uint256 maturity)
```

Remove the all future value if there is balance in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| removedAmount | int256 | Removed future value amount |
| maturity | uint256 | Maturity of future value |

