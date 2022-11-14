# Solidity API

## AddressResolver

Implements the logic to manage the contract addresses.

This contract store the contract name and contract address. When the contract calls other contracts,
the caller contract gets the contract address from this contract.
However, the contract addresses are cashed into the caller contract through the `MixinAddressResolver.sol` at the deployment,
so the caller doesn't need to call this contract each time it calls other contracts.

_This contract is used through the `./mixins/MixinAddressResolver.sol`. The names of the contracts that
need to be imported into this contract are managed in `./libraries/Contracts.sol`._

### initialize

```solidity
function initialize(address _owner) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |

### importAddresses

```solidity
function importAddresses(bytes32[] _names, address[] _addresses) public
```

Imports contract addresses.

_All addresses in the contract are overridden by `_addresses` in the argument._

### areAddressesImported

```solidity
function areAddressesImported(bytes32[] _names, address[] _addresses) external view returns (bool)
```

Gets if the addresses are imported.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the addresses are imported or not |

### getAddress

```solidity
function getAddress(bytes32 _name, string _reason) external view returns (address)
```

Gets the imported contract addresses for the name with error.

_This method is used when the caller need to get an error if the address in the name
is not imported._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The contract address |

### getAddress

```solidity
function getAddress(bytes32 _name) external view returns (address)
```

Gets the imported contract addresses for the name.

_This method is used when the caller doesn't need to get an error if the address in the name
is not imported._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The contract address |

### getAddresses

```solidity
function getAddresses() external view returns (address[])
```

Gets the all imported contract addresses.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | Array with the contract address |

