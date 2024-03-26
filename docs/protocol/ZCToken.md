# Solidity API

## ZCToken

Implements a token that represents zero-coupon bonds.

### initialize

```solidity
function initialize(address _resolver, string _name, string _symbol, uint8 _decimals, address _asset, uint256 _maturity) external
```

Initializes the contract.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address resolver to be used. |
| _name | string | The name of the token |
| _symbol | string | The symbol of the token |
| _decimals | uint8 | The number of decimals the token uses |
| _asset | address | The address of the token's underlying asset |
| _maturity | uint256 | The maturity of the token |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

_Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the default value returned by this function, unless
it's overridden.

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

### asset

```solidity
function asset() external view returns (address)
```

Gets the address of the token's underlying asset

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address of the token's underlying asset |

### maturity

```solidity
function maturity() external view returns (uint256)
```

Gets the maturity of the token

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The maturity of the token |

### mint

```solidity
function mint(address to, uint256 amount) external
```

Mints new tokens

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address | The address to receive the new tokens |
| amount | uint256 | The amount of tokens to mint |

### burn

```solidity
function burn(address from, uint256 amount) external
```

Burns tokens

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | The address to burn the tokens from |
| amount | uint256 | The amount of tokens to burn |

