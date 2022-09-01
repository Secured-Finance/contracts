# Solidity API

## Proxyable

### _IMPLEMENTATION_SLOT

```solidity
bytes32 _IMPLEMENTATION_SLOT
```

### _BEACON_SLOT

```solidity
bytes32 _BEACON_SLOT
```

### onlyProxy

```solidity
modifier onlyProxy()
```

### onlyBeacon

```solidity
modifier onlyBeacon()
```

### _getImplementation

```solidity
function _getImplementation() private view returns (address)
```

### _getBeacon

```solidity
function _getBeacon() internal view returns (address)
```

