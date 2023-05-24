# Solidity API

## BeaconProxyController

Implements the management of beacon proxy contracts.

All beacon proxy contracts are deployed from this contract.
This contract is also used to update the beacon proxy implementation.

### onlyLendingMarketController

```solidity
modifier onlyLendingMarketController()
```

Modifier to make a function callable only by LendingMarketController contract.

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

### getBeaconProxyAddress

```solidity
function getBeaconProxyAddress(bytes32 beaconName) external view returns (address beaconProxyAddress)
```

Gets the beacon proxy address to the selected name.

| Name | Type | Description |
| ---- | ---- | ----------- |
| beaconName | bytes32 | The cache name of the beacon proxy |

| Name | Type | Description |
| ---- | ---- | ----------- |
| beaconProxyAddress | address | The beacon proxy address |

### setFutureValueVaultImpl

```solidity
function setFutureValueVaultImpl(address newImpl) external
```

Sets the implementation contract of FutureValueVault

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### setLendingMarketImpl

```solidity
function setLendingMarketImpl(address newImpl) external
```

Sets the implementation contract of LendingMarket

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### deployFutureValueVault

```solidity
function deployFutureValueVault() external returns (address futureValue)
```

Deploys new FutureValueVault
Reverts on deployment market with existing currency and term

### deployLendingMarket

```solidity
function deployLendingMarket(bytes32 _ccy, uint256 _maturity, uint256 _openingDate) external returns (address market)
```

Deploys new LendingMarket

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Main currency for new lending market |
| _maturity | uint256 | The initial maturity of the market |
| _openingDate | uint256 | The timestamp when the market opens |

| Name | Type | Description |
| ---- | ---- | ----------- |
| market | address | The proxy contract address of created lending market |

### _createProxy

```solidity
function _createProxy(bytes32 beaconName, bytes data) internal returns (address)
```

### _updateBeaconImpl

```solidity
function _updateBeaconImpl(bytes32 name, address newAddress) internal returns (address beaconProxyAddress)
```

