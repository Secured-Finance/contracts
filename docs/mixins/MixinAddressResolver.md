# Solidity API

## MixinAddressResolver

### CacheUpdated

```solidity
event CacheUpdated(bytes32 name, address destination)
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

### resolver

```solidity
function resolver() public view returns (contract IAddressResolver)
```

### beaconProxyController

```solidity
function beaconProxyController() internal view returns (contract IBeaconProxyController)
```

### currencyController

```solidity
function currencyController() internal view returns (contract ICurrencyController)
```

### lendingMarketController

```solidity
function lendingMarketController() internal view returns (contract ILendingMarketController)
```

### tokenVault

```solidity
function tokenVault() internal view returns (contract ITokenVault)
```

