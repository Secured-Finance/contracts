# Solidity API

## MixinBeaconProxyController

### _registeredBeaconProxies

```solidity
mapping(bytes32 => address) _registeredBeaconProxies
```

### _getAddress

```solidity
function _getAddress(bytes32 beaconName) internal view returns (address beaconProxyAddress)
```

### _createProxy

```solidity
function _createProxy(bytes32 beaconName, bytes data) internal returns (address)
```

### _updateBeaconImpl

```solidity
function _updateBeaconImpl(bytes32 name, address newAddress) internal returns (address beaconProxyAddress)
```

