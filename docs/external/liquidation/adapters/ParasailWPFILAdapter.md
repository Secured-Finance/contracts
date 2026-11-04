# Solidity API

## ParasailWPFILAdapter

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
contract IParasailPool pool
```

### pFIL

```solidity
contract IERC20 pFIL
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
constructor(address _pool, address _wpFIL, address _pFIL, address _wFIL) public
```

### receive

```solidity
receive() external payable
```

Receives native FIL withdrawn from the Parasail pool.

### previewConvert

```solidity
function previewConvert(uint256 _amountIn) external view returns (uint256)
```

Estimates the amount of wrapped FIL received for a wpFIL conversion.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amountIn | uint256 | The amount of wpFIL to convert |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The estimated amount of wrapped FIL |

### convert

```solidity
function convert(uint256 _amountIn) external returns (uint256 amountOut)
```

Converts wpFIL into wrapped FIL and sends it to the caller.

_wpFIL is first unwrapped into pFIL. The pFIL is then redeemed for native FIL
through the Parasail pool and normalized into wrapped FIL._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amountIn | uint256 | The amount of wpFIL to convert |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountOut | uint256 | The amount of wrapped FIL sent to the caller |

