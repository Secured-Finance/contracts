# Solidity API

## CollateralVault

Implements the management of the collateral in each currency for users.
This contract allows users to deposit and withdraw various currencies as collateral.

Currencies that can be used as collateral are registered in the following steps.
1. Call the `supportCurrency` method in `CurrencyController.sol`.
2. Call the `registerCurrency` method in this contract.

_This contract has overlapping roles with `CollateralAggregator.sol`, so it will be merged
with `CollateralAggregator.sol` in the future._

### onlyRegisteredUser

```solidity
modifier onlyRegisteredUser()
```

Modifier to check if user registered on collateral aggregator

### initialize

```solidity
function initialize(address _owner, address _resolver, address _WETH9) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _WETH9 | address | The address of WETH |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### registerCurrency

```solidity
function registerCurrency(bytes32 _ccy, address _tokenAddress) external
```

### deposit

```solidity
function deposit(bytes32 _ccy, uint256 _amount) public payable
```

_Deposits funds by the caller into collateral._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### withdraw

```solidity
function withdraw(bytes32 _ccy, uint256 _amount) public
```

Withdraws funds by the caller from unused collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to withdraw. |

### getIndependentCollateral

```solidity
function getIndependentCollateral(address _user, bytes32 _ccy) public view returns (uint256)
```

Gets the amount deposited in the user's collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The deposited amount |

### getIndependentCollateralInETH

```solidity
function getIndependentCollateralInETH(address _user, bytes32 _ccy) public view returns (uint256)
```

Gets the amount deposited in the user's collateral by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Specified currency |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The deposited amount in ETH |

### getTotalIndependentCollateralInETH

```solidity
function getTotalIndependentCollateralInETH(address _user) public view returns (uint256)
```

Gets the total amount deposited in the user's collateral in all currencies.
by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of collateral user |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total deposited amount in ETH |

### getUsedCurrencies

```solidity
function getUsedCurrencies(address _user) public view returns (bytes32[])
```

Gets the currencies that the user used as collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | The currency names in bytes32 |

### _updateUsedCurrencies

```solidity
function _updateUsedCurrencies(bytes32 _ccy) internal
```

