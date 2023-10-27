# Solidity API

## MixinAccessControl

Implements functions to add  role-based access control mechanisms.

### CallerNotOperator

```solidity
error CallerNotOperator()
```

### OPERATOR_ROLE

```solidity
bytes32 OPERATOR_ROLE
```

### onlyOperator

```solidity
modifier onlyOperator()
```

_Throws if called by any account other than the admin._

### _setupInitialRoles

```solidity
function _setupInitialRoles(address _admin) internal
```

_Initializes the roles._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _admin | address | The address of the admin role |

### setRoleAdmin

```solidity
function setRoleAdmin(bytes32 role, bytes32 adminRole) external
```

Sets the role as admin of a specific role.

_By default the admin role for all roles is `DEFAULT_ADMIN_ROLE`._

| Name | Type | Description |
| ---- | ---- | ----------- |
| role | bytes32 | The role to be managed by the admin role |
| adminRole | bytes32 | The admin role |

### addOperator

```solidity
function addOperator(address admin) external
```

Adds a new admin as Operator

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin | address | The address of the new admin |

### removeOperator

```solidity
function removeOperator(address admin) external
```

Removes an admin as Operator

| Name | Type | Description |
| ---- | ---- | ----------- |
| admin | address | The address of the admin to remove |

