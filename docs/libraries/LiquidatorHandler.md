# Solidity API

## LiquidatorHandler

LiquidatorHandler is an library to handle the main parameters of liquidators.

### isRegistered

```solidity
function isRegistered(address user) internal view returns (bool)
```

Gets if the user is registered as a liquidator.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the user is registered as a liquidator or not |

### isActive

```solidity
function isActive(address user) internal view returns (bool)
```

Gets if the liquidator is active.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the liquidator is active or not |

### register

```solidity
function register(address _user) internal
```

Registers a user as a liquidator.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

### remove

```solidity
function remove(address _user) internal
```

Removes a user from a liquidator.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

