# Solidity API

## MixinFutureValue

### Transfer

```solidity
event Transfer(address from, address to, int256 value)
```

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(uint256 _maturity) public view returns (uint256)
```

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(uint256 _maturity) public view returns (uint256)
```

### getFutureValue

```solidity
function getFutureValue(address account) public view returns (int256, uint256)
```

### hasFutureValueInPastMaturity

```solidity
function hasFutureValueInPastMaturity(address account, uint256 maturity) public view returns (bool)
```

### _addFutureValue

```solidity
function _addFutureValue(address lender, address borrower, uint256 amount, uint256 maturity) internal returns (bool)
```

### _removeFutureValue

```solidity
function _removeFutureValue(address account) internal returns (int256, uint256)
```

