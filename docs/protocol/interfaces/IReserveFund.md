# Solidity API

## IReserveFund

### Pause

```solidity
event Pause(address account)
```

### Unpause

```solidity
event Unpause(address account)
```

### isPaused

```solidity
function isPaused() external view returns (bool)
```

### pause

```solidity
function pause() external
```

### unpause

```solidity
function unpause() external
```

### deposit

```solidity
function deposit(bytes32 ccy, uint256 amount) external payable
```

### withdraw

```solidity
function withdraw(bytes32 ccy, uint256 amount) external
```

