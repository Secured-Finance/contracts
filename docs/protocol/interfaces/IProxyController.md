# Solidity API

## IProxyController

### InvalidProxyContract

```solidity
error InvalidProxyContract()
```

### ProxyCreated

```solidity
event ProxyCreated(bytes32 id, address proxyAddress, address implementationAddress)
```

### ProxyUpdated

```solidity
event ProxyUpdated(bytes32 id, address proxyAddress, address newImplementationAddress, address oldImplementationAddress)
```

