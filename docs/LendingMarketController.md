# Solidity API

## LendingMarketController

Implements the module to manage separated lending order-book markets per maturity.

This contract also works as a factory contract that can deploy (start) a new lending market
for selected currency and maturity and has the calculation logic for the Genesis value in addition.

Deployed Lending Markets are rotated and reused as it reaches the maturity date. At the time of rotation,
a new maturity date is set and the compound factor is updated.

The users mainly call this contract to create orders to lend or borrow funds.

### BASIS_TERM

```solidity
uint256 BASIS_TERM
```

### hasLendingMarket

```solidity
modifier hasLendingMarket(bytes32 _ccy)
```

Modifier to check if the currency has a lending market.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### ifValidMaturity

```solidity
modifier ifValidMaturity(bytes32 _ccy, uint256 _maturity)
```

Modifier to check if there is a market in the maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the market |

### initialize

```solidity
function initialize(address _owner, address _resolver) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |

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

### getBasisDate

```solidity
function getBasisDate(bytes32 _ccy) external view returns (uint256)
```

Gets the basis date when the first market opens for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The basis date |

### getLendingMarkets

```solidity
function getLendingMarkets(bytes32 _ccy) external view returns (address[])
```

Gets the lending market contract addresses for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | Array with the lending market address |

### getLendingMarket

```solidity
function getLendingMarket(bytes32 _ccy, uint256 _maturity) external view returns (address)
```

Gets the lending market contract address for the selected currency and maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The lending market address |

### getFutureValueVault

```solidity
function getFutureValueVault(bytes32 _ccy, uint256 _maturity) public view returns (address)
```

Gets the feture value contract address for the selected currency and maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The lending market address |

### getBorrowUnitPrices

```solidity
function getBorrowUnitPrices(bytes32 _ccy) external view returns (uint256[])
```

Gets borrow prices per future value for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the borrowing prices per future value of the lending market |

### getLendUnitPrices

```solidity
function getLendUnitPrices(bytes32 _ccy) external view returns (uint256[])
```

Gets lend prices per future value for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the lending prices per future value of the lending market |

### getMidUnitPrices

```solidity
function getMidUnitPrices(bytes32 _ccy) external view returns (uint256[])
```

Gets mid prices per future value for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the mid prices per future value of the lending market |

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(bytes32 _ccy, uint256 _maturity, uint256 _limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

Gets the order book of borrow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the market |
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
| _maturity | uint256 | The maturity of the market |
| _limit | uint256 | The limit number to get |

| Name | Type | Description |
| ---- | ---- | ----------- |
| unitPrices | uint256[] | The array of borrow unit prices |
| amounts | uint256[] | The array of lend order amounts |
| quantities | uint256[] | The array of lend order quantities |

### getMaturities

```solidity
function getMaturities(bytes32 _ccy) public view returns (uint256[])
```

Gets maturities for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the lending market maturity |

### getTotalPresentValue

```solidity
function getTotalPresentValue(bytes32 _ccy, address _user) public view returns (int256 totalPresentValue)
```

Gets the total present value of the account for selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 for Lending Market |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalPresentValue | int256 | The total present value |

### getTotalPresentValueInETH

```solidity
function getTotalPresentValueInETH(address _user) external view returns (int256 totalPresentValue)
```

Gets the total present value of the account converted to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalPresentValue | int256 | The total present value in ETH |

### calculateLentFundsFromOrders

```solidity
function calculateLentFundsFromOrders(bytes32 _ccy, address _user) public view returns (uint256 workingOrdersAmount, uint256 claimableAmount, uint256 lentAmount)
```

Gets the funds that are calculated from the user's lending order list for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| workingOrdersAmount | uint256 | The working orders amount on the order book |
| claimableAmount | uint256 | The claimable amount due to the lending orders being filled on the order book |
| lentAmount | uint256 |  |

### calculateBorrowedFundsFromOrders

```solidity
function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _user) public view returns (uint256 workingOrdersAmount, uint256 obligationAmount, uint256 borrowedAmount)
```

Gets the funds that are calculated from the user's borrowing order list for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| workingOrdersAmount | uint256 | The working orders amount on the order book |
| obligationAmount | uint256 | The debt amount due to the borrow orders being filled on the order book |
| borrowedAmount | uint256 | The borrowed amount due to the borrow orders being filled on the order book |

### calculateTotalFundsInETH

```solidity
function calculateTotalFundsInETH(address _user) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalObligationAmount, uint256 totalBorrowedAmount)
```

### isInitializedLendingMarket

```solidity
function isInitializedLendingMarket(bytes32 _ccy) public view returns (bool)
```

Gets if the lending market is initialized.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the lending market is initialized or not |

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 _ccy, uint256 _basisDate, uint256 _compoundFactor) external
```

Initialize the lending market to set a basis date and compound factor

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _basisDate | uint256 | The basis date when the initial market is opened |
| _compoundFactor | uint256 | The initial compound factor when the initial market is opened |

### createLendingMarket

```solidity
function createLendingMarket(bytes32 _ccy) external returns (address market, address futureValue)
```

Deploys new Lending Market and save address at lendingMarkets mapping.
Reverts on deployment market with existing currency and term

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Main currency for new lending market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | address | The proxy contract address of created lending market |
| futureValue | address |  |

### createOrder

```solidity
function createOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external returns (bool)
```

Creates an order. Takes orders if the orders are matched,
and places new order if not match it.

In addition, converts the future value to the genesis value if there is future value in past maturity
before the execution of order creation.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### depositAndCreateOrder

```solidity
function depositAndCreateOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external returns (bool)
```

Deposits funds and creates an order at the same time.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### createLendOrderWithETH

```solidity
function createLendOrderWithETH(bytes32 _ccy, uint256 _maturity, uint256 _unitPrice) external payable returns (bool)
```

Creates a lend order with ETH. Takes the order if the order is matched,
and places new order if not match it.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### depositAndCreateLendOrderWithETH

```solidity
function depositAndCreateLendOrderWithETH(bytes32 _ccy, uint256 _maturity, uint256 _unitPrice) external payable returns (bool)
```

Deposits funds and creates a lend order with ETH at the same time.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### cancelOrder

```solidity
function cancelOrder(bytes32 _ccy, uint256 _maturity, uint48 _orderId) external returns (bool)
```

Cancels the own order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _orderId | uint48 | Market order id |

### rotateLendingMarkets

```solidity
function rotateLendingMarkets(bytes32 _ccy) external
```

Rotate the lending markets. In this rotation, the following actions are happened.
- Updates the maturity at the beginning of the market array.
- Moves the beginning of the market array to the end of it.
- Update the compound factor in this contract using the next market unit price.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |

### pauseLendingMarkets

```solidity
function pauseLendingMarkets(bytes32 _ccy) external returns (bool)
```

Pauses previously deployed lending market by currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### unpauseLendingMarkets

```solidity
function unpauseLendingMarkets(bytes32 _ccy) external returns (bool)
```

Unpauses previously deployed lending market by currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### cleanOrders

```solidity
function cleanOrders(address _user) public
```

Cleans own orders to remove order ids that are already filled on the order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### _convertFutureValueToGenesisValue

```solidity
function _convertFutureValueToGenesisValue(bytes32 _ccy, uint256 _maturity, address _futureValueVault, address _user) private returns (int256)
```

Converts the future value to the genesis value if there is balance in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |
| _maturity | uint256 |  |
| _futureValueVault | address | Market contract address |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | Current future value amount after update |

### _createOrder

```solidity
function _createOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) private returns (bool)
```

### _cleanOrders

```solidity
function _cleanOrders(bytes32 _ccy, uint256 _maturity, address _user) private returns (uint256 activeOrderCount, bool isFilled)
```

### _calculatePresentValue

```solidity
function _calculatePresentValue(bytes32 _ccy, uint256 maturity, int256 futureValueInMaturity, address lendingMarketInMaturity) private view returns (int256 totalPresentValue)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(uint256 _futureValue, uint256 _unitPrice) internal pure returns (uint256)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice) internal pure returns (int256)
```

