# Solidity API

## MixinWallet

Implements functions to make a contract a wallet, i.e. withdraw and deposit funds.

The _initialize function of this contract is expected to be called in an inheriting contract's intializer or constructor.

### TransactionFailed

```solidity
error TransactionFailed(uint256 index)
```

### WrongArrayLengths

```solidity
error WrongArrayLengths()
```

### TransactionExecuted

```solidity
event TransactionExecuted(address from, address target, uint256 value, bytes data)
```

### TransactionsExecuted

```solidity
event TransactionsExecuted(address from, address[] targets, uint256[] values, bytes[] data)
```

### _initialize

```solidity
function _initialize(address _owner, address _nativeToken) internal
```

### executeTransaction

```solidity
function executeTransaction(address _target, bytes _data) external payable
```

_Executes an arbitrary transaction by Secured Finance admin._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _target | address | Address to be called |
| _data | bytes | Encoded function data to be executed |

### executeTransactions

```solidity
function executeTransactions(address[] _targets, uint256[] _values, bytes[] _data) external
```

_Executes arbitrary transactions by Secured Finance admin._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _targets | address[] | Array of Addresses to be called |
| _values | uint256[] | Array of values to be sent to _targets addresses |
| _data | bytes[] | Encoded function data to be executed |

### _deposit

```solidity
function _deposit(contract ITokenVault _tokenvault, bytes32 _ccy, uint256 _amount) internal
```

_Deposits funds by the caller into the token vault._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokenvault | contract ITokenVault | TokenVault contract instance |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### _withdraw

```solidity
function _withdraw(contract ITokenVault _tokenvault, bytes32 _ccy, uint256 _amount) internal
```

_Withdraws funds by the caller from the token vault._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokenvault | contract ITokenVault | TokenVault contract instance |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

