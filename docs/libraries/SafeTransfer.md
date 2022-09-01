# Solidity API

## SafeTransfer

### WETH9

```solidity
address WETH9
```

### _registerToken

```solidity
function _registerToken(address _WETH9) internal
```

### receive

```solidity
receive() external payable
```

### _depositAssets

```solidity
function _depositAssets(address _token, address _payer, address _receiver, uint256 _amount) internal
```

### _withdrawAssets

```solidity
function _withdrawAssets(address _token, address _receiver, uint256 _amount) internal
```

### _wrapWETH

```solidity
function _wrapWETH(address _receiver, uint256 _amount) internal
```

### _unwrapWETH

```solidity
function _unwrapWETH(address _receiver, uint256 _amount) internal
```

### _safeApprove

```solidity
function _safeApprove(address token, address to, uint256 value) internal
```

_Transfer helper from UniswapV2 Router_

### _safeTransfer

```solidity
function _safeTransfer(address token, address to, uint256 amount) internal virtual
```

There are many non-compliant ERC20 tokens... this can handle most, adapted from UniSwap V2
Im trying to make it a habit to put external calls last (reentrancy)
You can put this in an internal function if you like.

### _safeTransferFrom

```solidity
function _safeTransferFrom(address token, address from, uint256 amount) internal virtual
```

### _safeTransferFrom

```solidity
function _safeTransferFrom(address token, address from, address to, uint256 value) internal
```

### _safeTransferETH

```solidity
function _safeTransferETH(address to, uint256 value) internal
```

