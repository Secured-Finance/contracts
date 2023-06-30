# Solidity API

## IFutureValueVault

### Transfer

```solidity
event Transfer(address from, address to, int256 value)
```

### getTotalSupply

```solidity
function getTotalSupply(uint256 maturity) external view returns (uint256)
```

### getFutureValue

```solidity
function getFutureValue(address user) external view returns (int256 futureValue, uint256 maturity)
```

### hasFutureValueInPastMaturity

```solidity
function hasFutureValueInPastMaturity(address user, uint256 maturity) external view returns (bool)
```

### addLendFutureValue

```solidity
function addLendFutureValue(address user, uint256 amount, uint256 maturity, bool isTaker) external
```

### addBorrowFutureValue

```solidity
function addBorrowFutureValue(address user, uint256 amount, uint256 maturity, bool isTaker) external
```

### transferFrom

```solidity
function transferFrom(address sender, address receiver, int256 amount, uint256 maturity) external
```

### removeFutureValue

```solidity
function removeFutureValue(address user, uint256 activeMaturity) external returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool removeFutureValue)
```

### addInitialTotalSupply

```solidity
function addInitialTotalSupply(uint256 maturity, int256 amount) external
```

### resetFutureValue

```solidity
function resetFutureValue(address _user) external
```

