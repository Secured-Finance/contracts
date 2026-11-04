# Solidity API

## GlifIFILAdapter

### InvalidAddress

```solidity
error InvalidAddress()
```

### InvalidInputAmount

```solidity
error InvalidInputAmount(uint256 expected, uint256 actual)
```

### pool

```solidity
contract IInfinityPool pool
```

### tokenIn

```solidity
address tokenIn
```

Gets the token accepted by this adapter.

| Name | Type | Description |
| ---- | ---- | ----------- |

### tokenOut

```solidity
address tokenOut
```

Gets the normalized ERC-20 token returned by this adapter.

| Name | Type | Description |
| ---- | ---- | ----------- |

### constructor

```solidity
constructor(address _pool, address _iFIL, address _wFIL) public
```

### receive

```solidity
receive() external payable
```

Receives native FIL redeemed by the Infinity Pool.

### previewConvert

```solidity
function previewConvert(uint256 _amountIn) external view returns (uint256)
```

Estimates the amount of wrapped FIL received for an iFIL conversion.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amountIn | uint256 | The amount of iFIL to convert |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The estimated amount of wrapped FIL |

### convert

```solidity
function convert(uint256 _amountIn) external returns (uint256 amountOut)
```

Converts iFIL into wrapped FIL and sends it to the caller.

_Native FIL returned by the Infinity Pool is wrapped before being sent._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amountIn | uint256 | The amount of iFIL to convert |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountOut | uint256 | The amount of wrapped FIL sent to the caller |

