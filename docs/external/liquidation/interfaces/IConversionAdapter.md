# Solidity API

## IConversionAdapter

### tokenIn

```solidity
function tokenIn() external view returns (address)
```

Gets the token accepted by this adapter.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address of the input token |

### tokenOut

```solidity
function tokenOut() external view returns (address)
```

Gets the normalized ERC-20 token returned by this adapter.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The address of the output token |

### previewConvert

```solidity
function previewConvert(uint256 amountIn) external view returns (uint256 amountOut)
```

Estimates the output amount for a conversion.

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountIn | uint256 | The amount of the input token to convert |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountOut | uint256 | The estimated amount of the output token |

### convert

```solidity
function convert(uint256 amountIn) external returns (uint256 amountOut)
```

Converts an input token into the normalized ERC-20 output token.

_The adapter pulls the input token from and sends the output token to the caller._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountIn | uint256 | The amount of the input token to convert |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountOut | uint256 | The amount of the output token sent to the caller |

