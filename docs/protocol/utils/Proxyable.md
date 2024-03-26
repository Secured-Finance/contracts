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

### getRevision

```solidity
function getRevision() external pure virtual returns (uint256)
```

Gets the revision number of the contract

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The revision number |

### _getImplementation

```solidity
function _getImplementation() private view returns (address)
```

### _getBeacon

```solidity
function _getBeacon() internal view returns (address)
```

