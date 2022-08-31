# Solidity API

## ProxyController

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

Set a proxy contract address of AddressResolver if it already exists.
If not, set zero address here and call `setAddressResolverImpl` using the implementation
address of AddressResolver to create a proxy contract.

_Contract constructor function._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |

### getAddressResolverAddress

```solidity
function getAddressResolverAddress() public view returns (address)
```

_Gets the proxy address of AddressResolver_

### getAddress

```solidity
function getAddress(bytes32 name) public view returns (address proxyAddress)
```

_Gets the proxy address to specified name_

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | bytes32 | The cache name of the contract |

### setAddressResolverImpl

```solidity
function setAddressResolverImpl(address newImpl) external
```

_Sets the implementation contract of AddressResolver_

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### setCollateralAggregatorImpl

```solidity
function setCollateralAggregatorImpl(address newImpl, uint256 marginCallThresholdRate, uint256 autoLiquidationThresholdRate, uint256 liquidationPriceRate, uint256 minCollateralRate) external
```

_Sets the implementation contract of CollateralAggregator_

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |
| marginCallThresholdRate | uint256 |  |
| autoLiquidationThresholdRate | uint256 |  |
| liquidationPriceRate | uint256 |  |
| minCollateralRate | uint256 |  |

### setCollateralVaultImpl

```solidity
function setCollateralVaultImpl(address newImpl, address _WETH9) external
```

_Sets the implementation contract of CollateralVault_

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |
| _WETH9 | address | The address of WETH |

### setCurrencyControllerImpl

```solidity
function setCurrencyControllerImpl(address newImpl) external
```

_Sets the implementation contract of CurrencyController_

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### setLendingMarketControllerImpl

```solidity
function setLendingMarketControllerImpl(address newImpl) external
```

_Sets the implementation contract of LendingMarketController_

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImpl | address | The address of implementation contract |

### changeProxyAdmins

```solidity
function changeProxyAdmins(address newAdmin, address[] destinations) external
```

_Updates admin addresses of proxy contract_

| Name | Type | Description |
| ---- | ---- | ----------- |
| newAdmin | address | The address of new admin |
| destinations | address[] | The destination contract addresses |

### _updateImpl

```solidity
function _updateImpl(bytes32 name, address newAddress, bytes data) internal returns (address proxyAddress)
```

_Sets the implementation contract of specified contract
The first time the contract address is set, `UpgradeabilityProxy` is created.
From the second time, the contract address set in the created `UpgradeabilityProxy`
will be updated._

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | bytes32 | The cache name of the contract |
| newAddress | address | The address of implementation contract |
| data | bytes | the data in a delegate call to a specified function |

### _getAddress

```solidity
function _getAddress(bytes32 name) internal view returns (address)
```

