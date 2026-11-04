# Solidity API

## ISwapExecutor

### supportsPair

```solidity
function supportsPair(address tokenIn, address tokenOut) external view returns (bool)
```

Returns whether this executor has an enabled route for a token pair.

### swap

```solidity
function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minimumAmountOut, address recipient) external payable returns (uint256 amountOut)
```

Swaps an exact input amount and sends the output to the recipient.

_Native input is supplied as msg.value while tokenIn remains the wrapped-native address.
     Native output is unwrapped before it is sent to the recipient._

