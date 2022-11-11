# Solidity API

## MigrationAddressResolver

Implements migration module to build caches of contract address from `AddressResolver.sol`
in the contract that is inherited `MixinAddressResolver.sol`.

This contract is used only in the following cases.
- The case of the initial deployment of the contract.
- The case when some contract needs to deploy a new proxy contract.

### buildCaches

```solidity
function buildCaches(address[] _addresses) external
```

## MigrationAddressResolver

Implements migration module to build caches of contract address from `AddressResolver.sol`
in the contract that is inherited `MixinAddressResolver.sol`.

This contract is used only in the following cases.
- The case of the initial deployment of the contract.
- The case when some contract needs to deploy a new proxy contract.

### buildCaches

```solidity
function buildCaches(address[] _addresses) external
```

