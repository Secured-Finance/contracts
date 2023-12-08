# Solidity API

## MixinAccessControl

Implements functions to add  role-based access control mechanisms.

### CallerNotOperator

```solidity
error CallerNotOperator()
```

### NotAllowedAccess

```solidity
error NotAllowedAccess(bytes32 role, address account)
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

### revokeRole

```solidity
function revokeRole(bytes32 role, address account) public
```

_Revokes `role` from `account`._

| Name | Type | Description |
| ---- | ---- | ----------- |
| role | bytes32 | The role to be revoked |
| account | address | The address of the account to revoke the role from |

### renounceRole

```solidity
function renounceRole(bytes32 role, address account) public pure
```

Revokes `role` from the calling account. This function is disabled by overriding it with a revert.

| Name | Type | Description |
| ---- | ---- | ----------- |
| role | bytes32 | The role to be revoked |
| account | address | The address of the account to revoke the role from |

