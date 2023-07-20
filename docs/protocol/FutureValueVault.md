# Solidity API

## FutureValueVault

Implements the management of the future value as an amount for Lending deals in each currency.

### initialize

```solidity
function initialize(address _resolver) external
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
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

### getTotalSupply

```solidity
function getTotalSupply(uint256 _maturity) external view returns (uint256)
```

Gets the total supply.

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

### addLendFutureValue

```solidity
function addLendFutureValue(address _user, uint256 _amount, uint256 _maturity, bool _isTaker) public
```

Adds the future value amount for lending deals.

_Since the total supply can be determined by totaling only the amounts on one side of the order
when the order is fulfilled, the total supply is incremented only when the executor of the original order
is the taker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _amount | uint256 | The amount to add |
| _maturity | uint256 | The maturity of the market |
| _isTaker | bool | The boolean if the original order is created by a taker |

### addBorrowFutureValue

```solidity
function addBorrowFutureValue(address _user, uint256 _amount, uint256 _maturity, bool _isTaker) public
```

Adds the future value amount for borrowing deals.

_Since the total supply can be determined by totaling only the amounts on one side of the order
when the order is fulfilled, the total supply is incremented only when the executor of the original order
is the taker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _amount | uint256 | The amount to add |
| _maturity | uint256 | The maturity of the market |
| _isTaker | bool | The boolean if the original order is created by a taker |

### transferFrom

```solidity
function transferFrom(address _sender, address _receiver, int256 _amount, uint256 _maturity) external
```

Transfers the future value from sender to receiver.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _sender | address | Sender's address |
| _receiver | address | Receiver's address |
| _amount | int256 | Amount of funds to sent |
| _maturity | uint256 | The maturity of the market |

### removeFutureValue

```solidity
function removeFutureValue(address _user, uint256 _activeMaturity) external returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved)
```

Removes all future values if there is an amount in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _activeMaturity | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| removedAmount | int256 | Removed future value amount |
| currentAmount | int256 | Current future value amount after update |
| maturity | uint256 | Maturity of future value |
| isAllRemoved | bool | The boolean if the all future value amount in the selected maturity is removed |

### addInitialTotalSupply

```solidity
function addInitialTotalSupply(uint256 _maturity, int256 _amount) external
```

Adds initial total supply at market opening

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The maturity of the market |
| _amount | int256 | The amount to add |

### executeForcedReset

```solidity
function executeForcedReset(address _user) external
```

Forces a reset of the user's future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### executeForcedReset

```solidity
function executeForcedReset(address _user, int256 _amount) external returns (int256 removedAmount, int256 balance)
```

Forces a reset of the user's future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _amount | int256 | The amount to reset |

### _updateTotalSupply

```solidity
function _updateTotalSupply(uint256 _maturity, int256 _previous, int256 _current, bool _isTaker) private
```

