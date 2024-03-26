# Solidity API

## FutureValueVault

Implements the management of the future value as an amount for Lending positions in each currency.

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

### getRevision

```solidity
function getRevision() external pure returns (uint256)
```

Gets the revision number of the contract

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The revision number |

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(uint256 _maturity) external view returns (uint256)
```

Gets the total supply of lending orders.

_This function returns the total supply of only orders that have been added
through the `increase` of `decrease` function._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The maturity of the market |

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(uint256 _maturity) external view returns (uint256)
```

Gets the total supply of borrowing orders.

_This function returns the total supply of only orders that have been added
through the `increase` of `decrease` function._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maturity | uint256 | The maturity of the market |

### getBalance

```solidity
function getBalance(uint8 _orderBookId, address _user) public view returns (int256 balance, uint256 maturity)
```

Gets the user balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| balance | int256 | The user balance |
| maturity | uint256 | The maturity of the market that the future value was added |

### getTotalLockedBalance

```solidity
function getTotalLockedBalance(uint8 _orderBookId) external view returns (uint256)
```

Gets the total locked balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 | The order book id |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total locked balance |

### hasBalanceAtPastMaturity

```solidity
function hasBalanceAtPastMaturity(uint8 _orderBookId, address _user, uint256 _maturity) public view returns (bool)
```

Gets if the account has past maturity balance at the selected maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |
| _maturity | uint256 | The maturity of the market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the lending market is initialized or not |

### increase

```solidity
function increase(uint8 _orderBookId, address _user, uint256 _amount, uint256 _maturity) public
```

Increases amount for lending deals.

_Since the total supply can be determined by totaling only the amounts on one side of the order
when the order is fulfilled, the total supply is incremented only when the executor of the original order
is the taker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |
| _amount | uint256 | The amount to add |
| _maturity | uint256 | The maturity of the market |

### decrease

```solidity
function decrease(uint8 _orderBookId, address _user, uint256 _amount, uint256 _maturity) public
```

Decreases amount for borrowing deals.

_Since the total supply can be determined by totaling only the amounts on one side of the order
when the order is fulfilled, the total supply is incremented only when the executor of the original order
is the taker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |
| _amount | uint256 | The amount to add |
| _maturity | uint256 | The maturity of the market |

### lock

```solidity
function lock(uint8 _orderBookId, address _user, uint256 _amount, uint256 _maturity) public returns (uint256 lockedAmount)
```

Locks user's balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |
| _amount | uint256 | The amount to lock |
| _maturity | uint256 | The maturity of the market |

| Name | Type | Description |
| ---- | ---- | ----------- |
| lockedAmount | uint256 | The amount locked |

### unlock

```solidity
function unlock(uint8 _orderBookId, address _user, uint256 _amount, uint256 _maturity) public
```

Unlocks user's balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |
| _amount | uint256 | The amount to lock |
| _maturity | uint256 | The maturity of the market |

### transferFrom

```solidity
function transferFrom(uint8 _orderBookId, address _sender, address _receiver, int256 _amount, uint256 _maturity) external
```

Transfers the future value from sender to receiver.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _sender | address | Sender's address |
| _receiver | address | Receiver's address |
| _amount | int256 | Amount of funds to sent |
| _maturity | uint256 | The maturity of the market |

### reset

```solidity
function reset(uint8 _orderBookId, address _user) external returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved)
```

Reset all amount if there is an amount in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| removedAmount | int256 | Removed future value amount |
| currentAmount | int256 | Current future value amount after update |
| maturity | uint256 | Maturity of future value |
| isAllRemoved | bool | The boolean if the all future value amount in the selected maturity is removed |

### executeForcedReset

```solidity
function executeForcedReset(uint8 _orderBookId, address _user) external
```

Forces a reset of the user's future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |

### executeForcedReset

```solidity
function executeForcedReset(uint8 _orderBookId, address _user, int256 _amount) external returns (int256 removedAmount, int256 balance)
```

Forces a reset of the user's future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookId | uint8 |  |
| _user | address | User's address |
| _amount | int256 | The amount to reset |

### _updateTotalSupply

```solidity
function _updateTotalSupply(uint256 _maturity, int256 _amount, int256 _balance) private
```

