# Solidity API

## FutureValueVault

Implements the management of the future value as an amount for Lending deals in each currency.

### onlyLendingMarket

```solidity
modifier onlyLendingMarket()
```

Modifier to make a function callable only by lending market.

### initialize

```solidity
function initialize(address _lendingMarket) external
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _lendingMarket | address | The address of the Lending Market contract |

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(uint256 _maturity) external view returns (uint256)
```

Gets the total lending supply.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The maturity of the market |

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(uint256 _maturity) external view returns (uint256)
```

Gets the total borrowing supply.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The maturity of the market |

### getFutureValue

```solidity
function getFutureValue(address _user) public view returns (int256 futureValue, uint256 maturity)
```

Gets the future value of the account.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| futureValue | int256 | The future value |
| maturity | uint256 | The maturity of the market that the future value was added |

### hasFutureValueInPastMaturity

```solidity
function hasFutureValueInPastMaturity(address _user, uint256 _maturity) public view returns (bool)
```

Gets if the account has the future value amount in the selected maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _maturity | uint256 | The maturity of the market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the lending market is initialized or not |

### addBorrowFutureValue

```solidity
function addBorrowFutureValue(address _user, uint256 _amount, uint256 _maturity) external returns (bool)
```

Adds the future value amount for borrowing deals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _amount | uint256 | The amount to add |
| _maturity | uint256 | The maturity of the market |

### addLendFutureValue

```solidity
function addLendFutureValue(address _user, uint256 _amount, uint256 _maturity) external returns (bool)
```

Adds the future value amount for lending deals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _amount | uint256 | The amount to add |
| _maturity | uint256 | The maturity of the market |

### removeFutureValue

```solidity
function removeFutureValue(address _user, uint256 _activeMaturity) external returns (int256 removedAmount, int256 currentAmount, uint256 maturity)
```

Remove all future values if there is an amount in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _activeMaturity | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| removedAmount | int256 | Removed future value amount |
| currentAmount | int256 | Current future value amount after update |
| maturity | uint256 | Maturity of future value |

