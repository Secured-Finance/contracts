# Solidity API

## MixinAddressResolver

### CacheUpdated

```solidity
event CacheUpdated(bytes32 name, address destination)
```

### resolver

```solidity
contract IAddressResolver resolver
```

### addressCache

```solidity
mapping(bytes32 => address) addressCache
```

### onlyAcceptedContracts

```solidity
modifier onlyAcceptedContracts()
```

### requiredContracts

```solidity
function requiredContracts() public pure virtual returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### acceptedContracts

```solidity
function acceptedContracts() public pure virtual returns (bytes32[] contracts)
```

Returns contract names that can call this contract.

_The contact name listed in this method is also needed to be listed `requiredContracts` method._

### buildCache

```solidity
function buildCache() public
```

### isResolverCached

```solidity
function isResolverCached() external view returns (bool)
```

### registerAddressResolver

```solidity
function registerAddressResolver(address _resolver) internal
```

_Register the Address Resolver contract_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |

### getAddress

```solidity
function getAddress(bytes32 name) internal view returns (address)
```

### isAcceptedContract

```solidity
function isAcceptedContract(address account) internal view virtual returns (bool)
```

### collateralAggregator

```solidity
function collateralAggregator() internal view returns (contract ICollateralAggregator)
```

### collateralVault

```solidity
function collateralVault() internal view returns (contract ICollateralVault)
```

### currencyController

```solidity
function currencyController() internal view returns (contract ICurrencyController)
```

### lendingMarketController

```solidity
function lendingMarketController() internal view returns (contract ILendingMarketController)
```

