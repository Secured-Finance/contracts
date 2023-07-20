# Solidity API

## IGenesisValueVault

### Transfer

```solidity
event Transfer(bytes32 ccy, address from, address to, int256 value)
```

### AutoRollExecuted

```solidity
event AutoRollExecuted(bytes32 ccy, uint256 lendingCompoundFactor, uint256 borrowingCompoundFactor, uint256 unitPrice, uint256 currentMaturity, uint256 previousMaturity)
```

### isInitialized

```solidity
function isInitialized(bytes32 ccy) external view returns (bool)
```

### decimals

```solidity
function decimals(bytes32 ccy) external view returns (uint8)
```

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(bytes32 ccy) external view returns (uint256)
```

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(bytes32 ccy) external view returns (uint256)
```

### getGenesisValue

```solidity
function getGenesisValue(bytes32 ccy, address user) external view returns (int256)
```

### getMaturityGenesisValue

```solidity
function getMaturityGenesisValue(bytes32 ccy, uint256 maturity) external view returns (int256)
```

### getCurrentMaturity

```solidity
function getCurrentMaturity(bytes32 ccy) external view returns (uint256)
```

### getLendingCompoundFactor

```solidity
function getLendingCompoundFactor(bytes32 ccy) external view returns (uint256)
```

### getBorrowingCompoundFactor

```solidity
function getBorrowingCompoundFactor(bytes32 ccy) external view returns (uint256)
```

### getAutoRollLog

```solidity
function getAutoRollLog(bytes32 ccy, uint256 maturity) external view returns (struct AutoRollLog)
```

### getLatestAutoRollLog

```solidity
function getLatestAutoRollLog(bytes32 ccy) external view returns (struct AutoRollLog)
```

### getGenesisValueInFutureValue

```solidity
function getGenesisValueInFutureValue(bytes32 ccy, address user) external view returns (int256)
```

### calculateFVFromFV

```solidity
function calculateFVFromFV(bytes32 ccy, uint256 basisMaturity, uint256 destinationMaturity, int256 futureValue) external view returns (int256)
```

### calculateGVFromFV

```solidity
function calculateGVFromFV(bytes32 ccy, uint256 basisMaturity, int256 futureValue) external view returns (int256)
```

### calculateFVFromGV

```solidity
function calculateFVFromGV(bytes32 ccy, uint256 basisMaturity, int256 genesisValue) external view returns (int256)
```

### getBalanceFluctuationByAutoRolls

```solidity
function getBalanceFluctuationByAutoRolls(bytes32 ccy, address user, uint256 maturity) external view returns (int256 fluctuation)
```

### calculateBalanceFluctuationByAutoRolls

```solidity
function calculateBalanceFluctuationByAutoRolls(bytes32 ccy, int256 balance, uint256 fromMaturity, uint256 toMaturity) external view returns (int256 fluctuation)
```

### initializeCurrencySetting

```solidity
function initializeCurrencySetting(bytes32 ccy, uint8 decimals, uint256 compoundFactor, uint256 maturity) external
```

### updateInitialCompoundFactor

```solidity
function updateInitialCompoundFactor(bytes32 ccy, uint256 unitPrice) external
```

### executeAutoRoll

```solidity
function executeAutoRoll(bytes32 ccy, uint256 maturity, uint256 nextMaturity, uint256 unitPrice, uint256 orderFeeRate) external
```

### updateGenesisValueWithFutureValue

```solidity
function updateGenesisValueWithFutureValue(bytes32 ccy, address user, uint256 basisMaturity, int256 fvAmount) external
```

### updateGenesisValueWithResidualAmount

```solidity
function updateGenesisValueWithResidualAmount(bytes32 ccy, address user, uint256 basisMaturity) external
```

### transferFrom

```solidity
function transferFrom(bytes32 ccy, address sender, address receiver, int256 amount) external
```

### cleanUpGenesisValue

```solidity
function cleanUpGenesisValue(bytes32 ccy, address user, uint256 maturity) external
```

### executeForcedReset

```solidity
function executeForcedReset(bytes32 _ccy, address _user) external
```

### executeForcedReset

```solidity
function executeForcedReset(bytes32 _ccy, uint256 _maturity, address _user, int256 _amountInFV) external returns (int256 removedAmount, int256 balance)
```

