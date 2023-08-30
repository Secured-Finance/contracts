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

### Transfer

```solidity
event Transfer(address from, address to, uint8 orderBookId, uint256 maturity, int256 value)
```

### getTotalSupply

```solidity
function getTotalSupply(uint256 maturity) external view returns (uint256)
```

### getBalance

```solidity
function getBalance(uint8 orderBookId, address user) external view returns (int256 futureValue, uint256 maturity)
```

### hasBalanceAtPastMaturity

```solidity
function hasBalanceAtPastMaturity(uint8 orderBookId, address user, uint256 maturity) external view returns (bool)
```

### increase

```solidity
function increase(uint8 orderBookId, address user, uint256 amount, uint256 maturity, bool isTaker) external
```

### decrease

```solidity
function decrease(uint8 orderBookId, address user, uint256 amount, uint256 maturity, bool isTaker) external
```

### transferFrom

```solidity
function transferFrom(uint8 orderBookId, address sender, address receiver, int256 amount, uint256 maturity) external
```

### reset

```solidity
function reset(uint8 orderBookId, address user, uint256 activeMaturity) external returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved)
```

### setInitialTotalSupply

```solidity
function setInitialTotalSupply(uint256 maturity, int256 amount) external
```

### executeForcedReset

```solidity
function executeForcedReset(uint8 orderBookId, address user) external
```

### executeForcedReset

```solidity
function executeForcedReset(uint8 orderBookId, address user, int256 amount) external returns (int256 removedAmount, int256 balance)
```

