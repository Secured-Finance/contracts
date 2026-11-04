# Solidity API

## UniswapUniversalRouterExecutor

Pair-aware swap executor backed by Uniswap Universal Router.

_Routes are owner-configured and can contain V3 and V4 exact-input hops. Each hop is
     executed separately so that mixed V3/V4 routes never expose arbitrary router commands._

### Protocol

```solidity
enum Protocol {
  V3,
  V4
}
```

### PoolKey

```solidity
struct PoolKey {
  address currency0;
  address currency1;
  uint24 fee;
  int24 tickSpacing;
  address hooks;
}
```

### ExactInputSingleParams

```solidity
struct ExactInputSingleParams {
  struct UniswapUniversalRouterExecutor.PoolKey poolKey;
  bool zeroForOne;
  uint128 amountIn;
  uint128 amountOutMinimum;
  bytes hookData;
}
```

### RouteStep

```solidity
struct RouteStep {
  enum UniswapUniversalRouterExecutor.Protocol protocol;
  address tokenOut;
  uint24 fee;
  int24 tickSpacing;
  address hooks;
  bytes hookData;
}
```

### InvalidAddress

```solidity
error InvalidAddress(address account)
```

### InvalidAmount

```solidity
error InvalidAmount(uint256 amount)
```

### InvalidRoute

```solidity
error InvalidRoute(address tokenIn, address tokenOut)
```

### InvalidRouteStep

```solidity
error InvalidRouteStep(uint256 index)
```

### InvalidNativeValue

```solidity
error InvalidNativeValue(uint256 expected, uint256 actual)
```

### InsufficientOutputAmount

```solidity
error InsufficientOutputAmount(uint256 minimumAmountOut, uint256 actualAmountOut)
```

### ReentrantCall

```solidity
error ReentrantCall()
```

### RouteUpdated

```solidity
event RouteUpdated(address tokenIn, address tokenOut, uint256 stepCount)
```

### SwapExecuted

```solidity
event SwapExecuted(address caller, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address recipient)
```

### UNIVERSAL_ROUTER_V3_SWAP_EXACT_IN

```solidity
uint8 UNIVERSAL_ROUTER_V3_SWAP_EXACT_IN
```

### UNIVERSAL_ROUTER_V4_SWAP

```solidity
uint8 UNIVERSAL_ROUTER_V4_SWAP
```

### V4_SWAP_EXACT_IN_SINGLE

```solidity
uint8 V4_SWAP_EXACT_IN_SINGLE
```

### V4_SETTLE_ALL

```solidity
uint8 V4_SETTLE_ALL
```

### V4_TAKE_ALL

```solidity
uint8 V4_TAKE_ALL
```

### ROUTER_DEADLINE_BUFFER

```solidity
uint256 ROUTER_DEADLINE_BUFFER
```

### universalRouter

```solidity
contract IUniversalRouter universalRouter
```

### permit2

```solidity
contract IPermit2 permit2
```

### wrappedNativeToken

```solidity
address wrappedNativeToken
```

### routes

```solidity
mapping(bytes32 => struct UniswapUniversalRouterExecutor.RouteStep[]) routes
```

### entered

```solidity
bool entered
```

### nonReentrant

```solidity
modifier nonReentrant()
```

### constructor

```solidity
constructor(address _universalRouter, address _permit2, address _wrappedNativeToken) public
```

### receive

```solidity
receive() external payable
```

### supportsPair

```solidity
function supportsPair(address _tokenIn, address _tokenOut) external view returns (bool)
```

### getRoute

```solidity
function getRoute(address _tokenIn, address _tokenOut) external view returns (struct UniswapUniversalRouterExecutor.RouteStep[])
```

### setRoute

```solidity
function setRoute(address _tokenIn, address _tokenOut, struct UniswapUniversalRouterExecutor.RouteStep[] _steps) external
```

Adds or replaces the route for a token pair.

### swap

```solidity
function swap(address _tokenIn, address _tokenOut, uint256 _amountIn, uint256 _minimumAmountOut, address _recipient) external payable returns (uint256 amountOut)
```

### _executeV3Swap

```solidity
function _executeV3Swap(address _tokenIn, address _tokenOut, uint24 _fee, uint256 _amountIn, uint256 _minimumAmountOut) private returns (uint256 amountOut)
```

### _executeV4Swap

```solidity
function _executeV4Swap(address _tokenIn, struct UniswapUniversalRouterExecutor.RouteStep _step, uint256 _amountIn, uint256 _minimumAmountOut) private returns (uint256 amountOut)
```

### _approveRouter

```solidity
function _approveRouter(address _token, uint256 _amount) private
```

### _revokeRouter

```solidity
function _revokeRouter(address _token) private
```

### _routeKey

```solidity
function _routeKey(address _tokenIn, address _tokenOut) private pure returns (bytes32)
```

