# Solidity API

## IFutureValueVault

### UserIsZero

```solidity
error UserIsZero()
```

### PastMaturityBalanceExists

```solidity
error PastMaturityBalanceExists(address user)
```

### TotalSupplyNotZero

```solidity
error TotalSupplyNotZero()
```

### InvalidResetAmount

```solidity
error InvalidResetAmount()
```

### InsufficientBalance

```solidity
error InsufficientBalance()
```

### InsufficientLockedBalance

```solidity
error InsufficientLockedBalance()
```

### Transfer

```solidity
event Transfer(address from, address to, uint8 orderBookId, uint256 maturity, int256 value)
```

### BalanceLocked

```solidity
event BalanceLocked(uint8 orderBookId, uint256 maturity, address user, uint256 value)
```

### BalanceUnlocked

```solidity
event BalanceUnlocked(uint8 orderBookId, uint256 maturity, address user, uint256 value)
```

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(uint256 maturity) external view returns (uint256)
```

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(uint256 maturity) external view returns (uint256)
```

### getBalance

```solidity
function getBalance(uint8 orderBookId, address user) external view returns (int256 futureValue, uint256 maturity)
```

### getTotalLockedBalance

```solidity
function getTotalLockedBalance(uint8 orderBookId) external view returns (uint256)
```

### hasBalanceAtPastMaturity

```solidity
function hasBalanceAtPastMaturity(uint8 orderBookId, address user, uint256 maturity) external view returns (bool)
```

### increase

```solidity
function increase(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external
```

### decrease

```solidity
function decrease(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external
```

### lock

```solidity
function lock(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external returns (uint256 lockedAmount)
```

### unlock

```solidity
function unlock(uint8 orderBookId, address user, uint256 amount, uint256 maturity) external
```

### transferFrom

```solidity
function transferFrom(uint8 orderBookId, address sender, address receiver, int256 amount, uint256 maturity) external
```

### reset

```solidity
function reset(uint8 orderBookId, address user) external returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved)
```

### executeForcedReset

```solidity
function executeForcedReset(uint8 orderBookId, address user) external
```

### executeForcedReset

```solidity
function executeForcedReset(uint8 orderBookId, address user, int256 amount) external returns (int256 removedAmount, int256 balance)
```

