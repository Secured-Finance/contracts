# Solidity API

## LendingMarketController

Implements the module to manage separated lending market contracts per currency.

This contract also works as a factory contract that can deploy (start) a new lending market & order book
for selected currency and maturity and has the calculation logic for the following user's funds in addition.
- Present Value(PV)
- Future Value(FV)
- Genesis Value(GV)

Once the order book is created, it will be rotated and reused once it reaches its maturity date. At the time of rotation,
a new maturity date is set and the compound factor is updated.

The users mainly call this contract to execute orders to lend or borrow funds.

### ifValidMaturity

```solidity
modifier ifValidMaturity(bytes32 _ccy, uint256 _maturity)
```

Modifier to check if there is an order book in the maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |

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
function initialize(address _owner, address _resolver, uint256 _marketBasePeriod) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _marketBasePeriod | uint256 | The base period for market maturity |

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

### isRedemptionRequired

```solidity
function isRedemptionRequired(address _user) external view returns (bool)
```

Gets if the user needs to redeem the funds.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the user needs to redeem the funds |

### getMarketTerminationDate

```solidity
function getMarketTerminationDate() external view returns (uint256)
```

Gets the date when the market terminated.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The termination date |

### getMarketTerminationPrice

```solidity
function getMarketTerminationPrice(bytes32 _ccy) external view returns (int256)
```

Gets the price cached at the market termination.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The price cached |

### getMarketTerminationRatio

```solidity
function getMarketTerminationRatio(bytes32 _ccy) external view returns (uint256)
```

Gets the ratio of each token in TokenVault at the market termination.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The ratio |

### getMinDebtUnitPrice

```solidity
function getMinDebtUnitPrice(bytes32 _ccy) external view returns (uint256)
```

Gets the min debt unit price for the selected currency.
This price is based on a one-year maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The genesis date |

### getCurrentMinDebtUnitPrice

```solidity
function getCurrentMinDebtUnitPrice(bytes32 _ccy, uint256 _maturity) external view returns (uint256)
```

Gets the current min debt unit price.
This price fluctuates depending on the current maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The current min debt unit price |

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

### getLendingMarket

```solidity
function getLendingMarket(bytes32 _ccy) external view returns (address)
```

Gets the lending market contract address for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Array with the lending market address |

### getOrderBookId

```solidity
function getOrderBookId(bytes32 _ccy, uint256 _maturity) external view returns (uint8)
```

Gets the order book id for the selected currency and maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the order book |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint8 | The order book id |

### getFutureValueVault

```solidity
function getFutureValueVault(bytes32 _ccy) public view returns (address)
```

Gets the future value contract address for the selected currency and maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The future value vault address |

### getOrderEstimation

```solidity
function getOrderEstimation(struct ILendingMarketController.GetOrderEstimationParams _params) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount, uint256 coverage, bool isInsufficientDepositAmount)
```

Gets the estimated order result by the calculation of the amount to be filled when executing an order in the order books.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _params | struct ILendingMarketController.GetOrderEstimationParams | The parameters to calculate the order estimation <br> - ccy: Currency name in bytes32 of the selected market <br> - maturity: The maturity of the market <br> - side: Order position type, Borrow or Lend <br> - amount: Amount of funds the maker wants to borrow/lend <br> - unitPrice: Amount of unit price taker wish to borrow/lend <br> - additionalDepositAmount: Additional amount to be deposited with the lending order <br> - ignoreBorrowedAmount: The boolean if the borrowed amount is ignored and not used as collateral or not |

| Name | Type | Description |
| ---- | ---- | ----------- |
| lastUnitPrice | uint256 | The last unit price that is filled on the order book |
| filledAmount | uint256 | The amount that is filled on the order book |
| filledAmountInFV | uint256 | The amount in the future value that is filled on the order book |
| orderFeeInFV | uint256 | The order fee amount in the future value |
| placedAmount | uint256 | The amount that is placed to the order book |
| coverage | uint256 | The rate of collateral used |
| isInsufficientDepositAmount | bool | The boolean if the order amount for lending in the selected currency is insufficient for the deposit amount or not |

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

### getOrderBookIds

```solidity
function getOrderBookIds(bytes32 _ccy) external view returns (uint8[])
```

Gets the order book ids.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint8[] | The array of order book id |

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

### getTotalPresentValueInBaseCurrency

```solidity
function getTotalPresentValueInBaseCurrency(address _user) external view returns (int256 totalPresentValue)
```

Gets the total present value of the account converted to base currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalPresentValue | int256 | The total present value in base currency |

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

### getPosition

```solidity
function getPosition(bytes32 _ccy, uint256 _maturity, address _user) external view returns (int256 presentValue, int256 futureValue)
```

Gets user's active position from the future value vault

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the selected order book |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| presentValue | int256 | The present value of the position |
| futureValue | int256 | The future value of the position |

### calculateFunds

```solidity
function calculateFunds(bytes32 _ccy, address _user, uint256 _liquidationThresholdRate) external view returns (struct ILendingMarketController.CalculatedFunds funds)
```

Gets the funds that are calculated from the user's lending and borrowing order list
for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |

| Name | Type | Description |
| ---- | ---- | ----------- |
| funds | struct ILendingMarketController.CalculatedFunds | The funds calculated from the user's lending and borrowing order list |

### calculateTotalFundsInBaseCurrency

```solidity
function calculateTotalFundsInBaseCurrency(address _user, struct ILendingMarketController.AdditionalFunds _additionalFunds, uint256 _liquidationThresholdRate) external view returns (struct ILendingMarketController.CalculatedTotalFunds funds)
```

Gets the funds that are calculated from the user's lending and borrowing order list
for all currencies in base currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _additionalFunds | struct ILendingMarketController.AdditionalFunds | The funds to be added for calculating the total funds |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |

| Name | Type | Description |
| ---- | ---- | ----------- |
| funds | struct ILendingMarketController.CalculatedTotalFunds | The total funds calculated from the user's lending and borrowing order list |

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
function initializeLendingMarket(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor, uint256 _orderFeeRate, uint256 _circuitBreakerLimitRange, uint256 _minDebtUnitPrice) external
```

Initialize the lending market to set a genesis date and compound factor

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _genesisDate | uint256 | The genesis date when the initial market is opened |
| _compoundFactor | uint256 | The initial compound factor when the initial market is opened |
| _orderFeeRate | uint256 | The order fee rate received by protocol |
| _circuitBreakerLimitRange | uint256 | The circuit breaker limit range |
| _minDebtUnitPrice | uint256 |  |

### createOrderBook

```solidity
function createOrderBook(bytes32 _ccy, uint256 _openingDate, uint256 _preOpeningDate) external
```

Creates new order book.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Main currency for new order book |
| _openingDate | uint256 | The timestamp when the order book opens |
| _preOpeningDate | uint256 | The timestamp when the order book pre-opens |

### executeOrder

```solidity
function executeOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external returns (bool)
```

Executes an order. Takes orders if the order is matched,
and places new order if not match it.

In addition, converts the future value to the genesis value if there is future value in past maturity
before the execution of order creation.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### depositAndExecuteOrder

```solidity
function depositAndExecuteOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external payable returns (bool)
```

Deposits funds and executes an order at the same time.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### executePreOrder

```solidity
function executePreOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) public returns (bool)
```

Executes a pre-order. A pre-order will only be accepted from 168 hours (7 days) to 1 hour
before the order book opens (Pre-order period). At the end of this period, Itayose will be executed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### depositAndExecutesPreOrder

```solidity
function depositAndExecutesPreOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external payable returns (bool)
```

Deposits funds and executes a pre-order at the same time.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _unitPrice | uint256 | Amount of unit price taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### unwindPosition

```solidity
function unwindPosition(bytes32 _ccy, uint256 _maturity) external returns (bool)
```

Unwinds user's lending or borrowing positions by creating an opposite position order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |

### executeRedemption

```solidity
function executeRedemption(bytes32 _ccy, uint256 _maturity) external returns (bool)
```

Redeem user's lending positions.
Redemption can only be executed once the order book has matured after the currency has been delisted.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |

### executeRepayment

```solidity
function executeRepayment(bytes32 _ccy, uint256 _maturity) external returns (bool)
```

Repay user's borrowing positions.
Repayment can only be executed once the order book has matured after the currency has been delisted.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |

### executeEmergencySettlement

```solidity
function executeEmergencySettlement() external returns (bool)
```

Force settlement of all lending and borrowing positions.
This function is executed under the present value as of the termination date.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### executeItayoseCalls

```solidity
function executeItayoseCalls(bytes32[] _currencies, uint256 _maturity) external returns (bool)
```

Executes Itayose calls per selected currencies.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _currencies | bytes32[] | Currency name list in bytes32 |
| _maturity | uint256 | The maturity of the selected order book |

### cancelOrder

```solidity
function cancelOrder(bytes32 _ccy, uint256 _maturity, uint48 _orderId) external returns (bool)
```

Cancels the own order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |
| _maturity | uint256 | The maturity of the selected order book |
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
| _debtMaturity | uint256 | The order book maturity of the debt |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### executeForcedRepayment

```solidity
function executeForcedRepayment(bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, address _user) external returns (bool)
```

Execute forced repayment for a borrowing position if repayment date is over.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _collateralCcy | bytes32 | Currency name to be used as collateral |
| _debtCcy | bytes32 | Currency name to be used as debt |
| _debtMaturity | uint256 | The order book maturity of the debt |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### rotateOrderBooks

```solidity
function rotateOrderBooks(bytes32 _ccy) external
```

Rotates the order books. In this rotation, the following actions are happened.
- Updates the maturity at the beginning of the order book array.
- Moves the beginning of the order book array to the end of it (Market rotation).
- Update the compound factor in this contract using the next order book unit price. (Auto-rolls)
- Convert the future value held by reserve funds into the genesis value

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected order book |

### executeEmergencyTermination

```solidity
function executeEmergencyTermination() external
```

Executes an emergency termination to stop the protocol. Once this function is executed,
the protocol cannot be run again. Also, users will only be able to redeem and withdraw.

### pauseLendingMarket

```solidity
function pauseLendingMarket(bytes32 _ccy) external returns (bool)
```

Pauses the lending market by currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### unpauseLendingMarket

```solidity
function unpauseLendingMarket(bytes32 _ccy) external returns (bool)
```

Unpauses the lending market by currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### cleanUpAllFunds

```solidity
function cleanUpAllFunds(address _user) external returns (bool)
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

### updateMinDebtUnitPrice

```solidity
function updateMinDebtUnitPrice(bytes32 _ccy, uint256 _minDebtUnitPrice) external
```

Updates the min debt unit price for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _minDebtUnitPrice | uint256 | The min debt unit price |

