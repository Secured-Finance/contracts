# Solidity API

## ERC20Handler

### initialize

```solidity
function initialize(address _nativeToken) internal
```

### nativeToken

```solidity
function nativeToken() internal view returns (address)
```

### isNative

```solidity
function isNative(address _token) internal view returns (bool)
```

### depositAssets

```solidity
function depositAssets(address _token, address _payer, address _receiver, uint256 _amount) internal
```

### withdrawAssets

```solidity
function withdrawAssets(address _token, address _receiver, uint256 _amount) internal
```

### convertToWrappedToken

```solidity
function convertToWrappedToken(address _receiver, uint256 _amount) internal
```

### convertFromWrappedToken

```solidity
function convertFromWrappedToken(address _receiver, uint256 _amount) internal
```

### safeApprove

```solidity
function safeApprove(address token, address to, uint256 value) internal
```

_Transfer helper from UniswapV2 Router_

### safeTransfer

```solidity
function safeTransfer(address token, address to, uint256 amount) internal
```

There are many non-compliant ERC20 tokens... this can handle most, adapted from UniSwap V2
Im trying to make it a habit to put external calls last (reentrancy)
You can put this in an internal function if you like.

### safeTransferFrom

```solidity
function safeTransferFrom(address token, address from, address to, uint256 value) internal
```

### safeTransferETH

```solidity
function safeTransferETH(address to, uint256 value) internal
```

