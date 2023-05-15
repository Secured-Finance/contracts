# Solidity API

## LendingMarketController

Implements the module to manage separated lending order-book markets per maturity.

This contract also works as a factory contract that can deploy (start) a new lending market
for selected currency and maturity and has the calculation logic for the Genesis value in addition.

Deployed Lending Markets are rotated and reused as it reaches the maturity date. At the time of rotation,
a new maturity date is set and the compound factor is updated.

The users mainly call this contract to create orders to lend or borrow funds.

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

### ifActive

```solidity
modifier ifActive()
```

Modifier to check if the protocol is active.

### ifInactive

```solidity
modifier ifInactive()
```

Modifier to check if the protocol is inactive.

### initialize

```solidity
function initialize(address _owner, address _resolver, uint256 _marketBasePeriod, uint256 _observationPeriod) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _marketBasePeriod | uint256 | The base period for market maturity |
| _observationPeriod | uint256 | The observation period to calculate the volume-weighted average price of transactions |

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

### isTerminated

```solidity
function isTerminated() public view returns (bool)
```

Gets if the protocol has not been terminated.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the protocol has not been terminated |

### getGenesisDate

```solidity
function getGenesisDate(bytes32 _ccy) external view returns (uint256)
```

Gets the genesis date when the first market opens for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The genesis date |

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

### getUsedCurrencies

```solidity
function getUsedCurrencies(address _user) external view returns (bytes32[])
```

Get all the currencies in which the user has lending positions or orders.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | The array of the currency |

### getFutureValue

```solidity
function getFutureValue(bytes32 _ccy, uint256 _maturity, address _user) external view returns (int256 futureValue)
```

Gets the future value of the account for selected currency and maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 for Lending Market |
| _maturity | uint256 | The maturity of the market |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| futureValue | int256 | The future value |

### getPresentValue

```solidity
function getPresentValue(bytes32 _ccy, uint256 _maturity, address _user) external view returns (int256 presentValue)
```

Gets the present value of the account for selected currency and maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 for Lending Market |
| _maturity | uint256 | The maturity of the market |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| presentValue | int256 | The present value |

### getTotalPresentValue

```solidity
function getTotalPresentValue(bytes32 _ccy, address _user) external view returns (int256 totalPresentValue)
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

### getGenesisValue

```solidity
function getGenesisValue(bytes32 _ccy, address _user) external view returns (int256 genesisValue)
```

Gets the genesis value of the account.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 for Lending Market |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| genesisValue | int256 | The genesis value |

### getOrders

```solidity
function getOrders(bytes32[] _ccys, address _user) external view returns (struct ILendingMarketController.Order[] activeOrders, struct ILendingMarketController.Order[] inactiveOrders)
```

Gets user's active and inactive orders in the order book

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccys | bytes32[] | Currency name list in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeOrders | struct ILendingMarketController.Order[] | The array of active orders in the order book |
| inactiveOrders | struct ILendingMarketController.Order[] | The array of inactive orders |

### calculateFunds

```solidity
function calculateFunds(bytes32 _ccy, address _user) external view returns (uint256 workingLendOrdersAmount, uint256 claimableAmount, uint256 collateralAmount, uint256 lentAmount, uint256 workingBorrowOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

Gets the funds that are calculated from the user's lending and borrowing order list
for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| workingLendOrdersAmount | uint256 | The working orders amount on the lend order book |
| claimableAmount | uint256 | The claimable amount due to the lending orders being filled on the order book |
| collateralAmount | uint256 | The actual collateral amount that is calculated by netting using the haircut. |
| lentAmount | uint256 | The lent amount due to the lend orders being filled on the order book |
| workingBorrowOrdersAmount | uint256 | The working orders amount on the borrow order book |
| debtAmount | uint256 | The debt amount due to the borrow orders being filled on the order book |
| borrowedAmount | uint256 | The borrowed amount due to the borrow orders being filled on the order book |

### calculateTotalFundsInETH

```solidity
function calculateTotalFundsInETH(address _user, bytes32 _depositCcy, uint256 _depositAmount) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount, bool isEnoughDeposit)
```

Gets the funds that are calculated from the user's lending and borrowing order list
for all currencies in ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _depositCcy | bytes32 | Currency name to be used as deposit |
| _depositAmount | uint256 | Amount to deposit |

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
function initializeLendingMarket(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor, uint256 _orderFeeRate, uint256 _autoRollFeeRate) external
```

Initialize the lending market to set a genesis date and compound factor

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _genesisDate | uint256 | The genesis date when the initial market is opened |
| _compoundFactor | uint256 | The initial compound factor when the initial market is opened |
| _orderFeeRate | uint256 | The order fee rate received by protocol |
| _autoRollFeeRate | uint256 | The auto roll fee rate received by protocol |

### createLendingMarket

```solidity
function createLendingMarket(bytes32 _ccy, uint256 _openingDate) external
```

Deploys new Lending Market and save address at lendingMarkets mapping.
Reverts on deployment market with existing currency and term

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Main currency for new lending market |
| _openingDate | uint256 | Timestamp when the lending market opens |

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
function depositAndCreateOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external payable returns (bool)
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

### createPreOrder

```solidity
function createPreOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) public returns (bool)
```

Creates a pre-order. A pre-order will only be accepted from 48 hours to 1 hour
before the market opens (Pre-order period). At the end of this period, Itayose will be executed.

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

### depositAndCreatePreOrder

```solidity
function depositAndCreatePreOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external payable returns (bool)
```

Deposits funds and creates a pre-order at the same time.

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

### unwindOrder

```solidity
function unwindOrder(bytes32 _ccy, uint256 _maturity) external returns (bool)
```

Unwinds user's lending or borrowing positions by creating an opposite position order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |

### executeRedemption

```solidity
function executeRedemption(bytes32 _redemptionCcy, bytes32 _collateralCcy) external returns (bool)
```

Redeems all lending and borrowing positions.
This function uses the present value as of the termination date.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _redemptionCcy | bytes32 | Currency name of positions to be redeemed |
| _collateralCcy | bytes32 | Currency name of collateral |

### executeItayoseCalls

```solidity
function executeItayoseCalls(bytes32[] _currencies, uint256 _maturity) external returns (bool)
```

Executes Itayose calls per selected currencies.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _currencies | bytes32[] | Currency name list in bytes32 |
| _maturity | uint256 | The maturity of the selected market |

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

### executeLiquidationCall

```solidity
function executeLiquidationCall(bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, address _user) external returns (bool)
```

Liquidates a lending or borrowing position if the user's coverage is hight.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _collateralCcy | bytes32 | Currency name to be used as collateral |
| _debtCcy | bytes32 | Currency name to be used as debt |
| _debtMaturity | uint256 | The market maturity of the debt |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### rotateLendingMarkets

```solidity
function rotateLendingMarkets(bytes32 _ccy) external
```

Rotates the lending markets. In this rotation, the following actions are happened.
- Updates the maturity at the beginning of the market array.
- Moves the beginning of the market array to the end of it (Market rotation).
- Update the compound factor in this contract using the next market unit price. (Auto-rolls)
- Convert the future value held by reserve funds into the genesis value

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |

### executeEmergencyTermination

```solidity
function executeEmergencyTermination() external
```

Executes an emergency termination to stop the protocol. Once this function is executed,
the protocol cannot be run again. Also, users will only be able to redeem and withdraw.

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
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### cleanUpAllFunds

```solidity
function cleanUpAllFunds(address _user) external
```

Clean up all funds of the user

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### cleanUpFunds

```solidity
function cleanUpFunds(bytes32 _ccy, address _user) external returns (uint256 totalActiveOrderCount)
```

Clean up user funds used for lazy evaluation by the following actions:
- Removes order IDs that is already filled on the order book.
- Convert Future values that have already been auto-rolled to Genesis values.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

### _createOrder

```solidity
function _createOrder(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) private returns (uint256 filledAmount)
```

### _updateFundsForTaker

```solidity
function _updateFundsForTaker(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledAmount, uint256 _filledFutureValue, uint256 _filledUnitPrice, uint256 _feeFutureValue) private
```

### _updateFundsForMaker

```solidity
function _updateFundsForMaker(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder) private
```

### _createPreOrder

```solidity
function _createPreOrder(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) private
```

