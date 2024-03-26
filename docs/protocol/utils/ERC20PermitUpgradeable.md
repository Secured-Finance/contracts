# Solidity API

## ERC20PermitUpgradeable

This contract is from OpenZeppelin Contracts that implements the ERC20 Permit extension allowing approvals
to be made via signatures, as defined in EIP-2612.

### _PERMIT_TYPEHASH

```solidity
bytes32 _PERMIT_TYPEHASH
```

### _PERMIT_TYPEHASH_DEPRECATED_SLOT

```solidity
bytes32 _PERMIT_TYPEHASH_DEPRECATED_SLOT
```

_In previous versions `_PERMIT_TYPEHASH` was declared as `immutable`.
However, to ensure consistency with the upgradeable transpiler, we will continue
to reserve a slot._

### __ERC20Permit_initialize

```solidity
function __ERC20Permit_initialize(string name) internal
```

_Initializes the {EIP712} domain separator using the `name` parameter, and setting `version` to `"1"`.

It's a good idea to use the same `name` that is defined as the ERC20 token name._

### permit

```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public virtual
```

_See {IERC20Permit-permit}._

### nonces

```solidity
function nonces(address owner) public view virtual returns (uint256)
```

_See {IERC20Permit-nonces}._

### DOMAIN_SEPARATOR

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32)
```

_See {IERC20Permit-DOMAIN_SEPARATOR}._

### _useNonce

```solidity
function _useNonce(address owner) internal virtual returns (uint256 current)
```

_"Consume a nonce": return the current value and increment.

_Available since v4.1.__

