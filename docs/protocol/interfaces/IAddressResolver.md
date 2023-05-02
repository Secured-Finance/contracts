# Solidity API

## IAddressResolver

### AddressImported

```solidity
event AddressImported(bytes32 name, address destination)
```

### getAddress

```solidity
function getAddress(bytes32 name, string reason) external view returns (address)
```

### getAddress

```solidity
function getAddress(bytes32 name) external view returns (address)
```

### getAddresses

```solidity
function getAddresses() external view returns (address[])
```

