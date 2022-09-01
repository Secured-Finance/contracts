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

### getBorrowRates

```solidity
function getBorrowRates(bytes32 _ccy) external view returns (uint256[])
```

Gets borrow rates for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the borrowing rate of the lending market |

### getLendRates

```solidity
function getLendRates(bytes32 _ccy) external view returns (uint256[])
```

Gets lend rates for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the lending rate of the lending market |

### getMidRates

```solidity
function getMidRates(bytes32 _ccy) external view returns (uint256[])
```

Gets mid rates for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | Array with the mid rate of the lending market |

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
function getTotalPresentValue(bytes32 _ccy, address _account) public view returns (int256 totalPresentValue)
```

Gets the total present value of the account for selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 for Lending Market |
| _account | address | Target account address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalPresentValue | int256 | The total present value |

### getTotalPresentValueInETH

```solidity
function getTotalPresentValueInETH(address _account) public view returns (int256 totalPresentValue)
```

Gets the total present value of the account converted to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Target account address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalPresentValue | int256 | The total present value in ETH |

### getBeaconProxyAddress

```solidity
function getBeaconProxyAddress(bytes32 beaconName) external view returns (address)
```

Gets the beacon proxy address to the selected name.

| Name | Type | Description |
| ---- | ---- | ----------- |
| beaconName | bytes32 | The cache name of the beacon proxy |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | totalPresentValue The beacon proxy address |

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

### setLendingMarketImpl

```solidity
function setLendingMarketImpl(address newImpl) external
```

Sets the implementation contract of LendingMarket

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### createLendingMarket

```solidity
function createLendingMarket(bytes32 _ccy) external returns (address market)
```

Deploys new Lending Market and save address at lendingMarkets mapping.
Reverts on deployment market with existing currency and term

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Main currency for new lending market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | address | The proxy contract address of created lending market |

### createOrder

```solidity
function createOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _rate) external returns (bool)
```

Creates the order. Takes the order if the order is matched,
and places new order if not match it.

In addition, converts the future value to the genesis value if there is future value in past maturity
before the execution of order creation.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _rate | uint256 | Amount of interest rate taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### matchOrders

```solidity
function matchOrders(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _rate) external view returns (bool)
```

Gets if the market order will be matched or not.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _side | enum ProtocolTypes.Side | Order position type, Borrow or Lend |
| _amount | uint256 | Amount of funds the maker wants to borrow/lend |
| _rate | uint256 | Amount of interest rate taker wish to borrow/lend |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### cancelOrder

```solidity
function cancelOrder(bytes32 _ccy, uint256 _maturity, uint256 _orderId) external returns (bool)
```

Cancels the own order.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 of the selected market |
| _maturity | uint256 | The maturity of the selected market |
| _orderId | uint256 | Market order id |

### rotateLendingMarkets

```solidity
function rotateLendingMarkets(bytes32 _ccy) external
```

Rotate the lending markets. In this rotation, the following actions are happened.
- Updates the maturity at the beginning of the market array.
- Moves the beginning of the market array to the end of it.
- Update the compound factor in this contract using the next market rate.

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

### convertFutureValueToGenesisValue

```solidity
function convertFutureValueToGenesisValue(address _user) external
```

Converts FutureValue to GenesisValue if there is balance in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### _convertFutureValueToGenesisValue

```solidity
function _convertFutureValueToGenesisValue(bytes32 _ccy, address _marketAddr, address _user) private
```

Converts the future value to the genesis value if there is balance in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |
| _marketAddr | address | Market contract address |
| _user | address | User's address |

### _deployLendingMarket

```solidity
function _deployLendingMarket(bytes32 _ccy, uint256 _maturity, uint256 _basisDate) private returns (address)
```

Deploys the lending market contract.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity of the market |
| _basisDate | uint256 | The basis date |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The proxy contract address of created lending market |

