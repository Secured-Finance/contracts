# Solidity API

## ReserveFund

Implements managing of the reserve fund.

### receive

```solidity
receive() external payable
```

### initialize

```solidity
function initialize(address _owner, address _resolver, address _nativeToken) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _nativeToken | address | The address of wrapped token of native currency |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### isPaused

```solidity
function isPaused() public view returns (bool)
```

Gets if the reserve fund is paused.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the reserve fund is paused |

### pause

```solidity
function pause() public
```

Pauses the reserve fund.

### unpause

```solidity
function unpause() public
```

Unpauses the reserve fund.

### deposit

```solidity
function deposit(bytes32 _ccy, uint256 _amount) external payable
```

_Deposits funds by the caller into the token vault as reserve fund._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### withdraw

```solidity
function withdraw(bytes32 _ccy, uint256 _amount) external
```

_Withdraw funds by the caller from the token vault._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

