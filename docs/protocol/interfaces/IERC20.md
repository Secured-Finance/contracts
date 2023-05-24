# Solidity API

## IERC20

### Approval

```solidity
event Approval(address owner, address spender, uint256 value)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 value)
```

### name

```solidity
function name() external view returns (string)
```

### symbol

```solidity
function symbol() external view returns (string)
```

### decimals

```solidity
function decimals() external view returns (uint8)
```

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address owner) external view returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

### approve

```solidity
function approve(address spender, uint256 value) external returns (bool)
```

### transfer

```solidity
function transfer(address to, uint256 value) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external returns (bool)
```

