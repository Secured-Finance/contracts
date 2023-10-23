# Solidity API

## RoleData

```solidity
struct RoleData {
  mapping(address => bool) members;
  bytes32 adminRole;
}
```

## AccessControlStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => struct RoleData) roles;
}
```

### slot

```solidity
function slot() internal pure returns (struct AccessControlStorage.Storage r)
```

