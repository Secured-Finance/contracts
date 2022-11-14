# Solidity API

## ProxyController

Implements the management of proxy contracts.

All proxy contracts are deployed from this contract.
This contract is also used to update the proxy implementation.

### resolver

```solidity
contract IAddressResolver resolver
```

### ADDRESS_RESOLVER

```solidity
bytes32 ADDRESS_RESOLVER
```

### constructor

```solidity
constructor(address _resolver) public
```

Contract constructor function.

_Set a proxy contract address of AddressResolver if it already exists.
If not, set zero address here and call `setAddressResolverImpl` using the implementation
address of AddressResolver to create a proxy contract._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |

### getAddressResolverAddress

```solidity
function getAddressResolverAddress() public view returns (address)
```

Gets the proxy address of AddressResolver

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The contract address of AddressResolver |

### getAddress

```solidity
function getAddress(bytes32 name) public view returns (address proxyAddress)
```

Gets the proxy address fro selected name

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | bytes32 | The cache name of the contract |

| Name | Type | Description |
| ---- | ---- | ----------- |
| proxyAddress | address | The proxy address for selected name |

### setAddressResolverImpl

```solidity
function setAddressResolverImpl(address newImpl) external
```

Sets the implementation contract of AddressResolver

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### setBeaconProxyControllerImpl

```solidity
function setBeaconProxyControllerImpl(address newImpl) external
```

Sets the implementation contract of CurrencyController

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### setTokenVaultImpl

```solidity
function setTokenVaultImpl(address newImpl, uint256 marginCallThresholdRate, uint256 autoLiquidationThresholdRate, uint256 liquidationPriceRate, uint256 minCollateralRate, address WETH9) external
```

Sets the implementation contract of TokenVault

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |
| marginCallThresholdRate | uint256 | The rate used as the margin call threshold |
| autoLiquidationThresholdRate | uint256 | The rate used as the auto liquidation threshold |
| liquidationPriceRate | uint256 | The rate used as the liquidation price |
| minCollateralRate | uint256 | The rate used minima collateral |
| WETH9 | address | The address of WETH |

### setCurrencyControllerImpl

```solidity
function setCurrencyControllerImpl(address newImpl) external
```

Sets the implementation contract of CurrencyController

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### setLendingMarketControllerImpl

```solidity
function setLendingMarketControllerImpl(address newImpl) external
```

Sets the implementation contract of LendingMarketController

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### changeProxyAdmins

```solidity
function changeProxyAdmins(address newAdmin, address[] destinations) external
```

Updates admin addresses of proxy contract

| Name | Type | Description |
| ---- | ---- | ----------- |
| newAdmin | address | The address of new admin |
| destinations | address[] | The destination contract addresses |

### _updateImpl

```solidity
function _updateImpl(bytes32 name, address newAddress, bytes data) internal returns (address proxyAddress)
```

Updates the implementation contract of specified contract
The first time the contract address is set, `UpgradeabilityProxy` is created.
From the second time, the contract address set in the created `UpgradeabilityProxy`
will be updated.

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | bytes32 | The cache name of the contract |
| newAddress | address | The address of implementation contract |
| data | bytes | the data in a delegate call to a specified function |

### _getAddress

```solidity
function _getAddress(bytes32 name) internal view returns (address)
```

