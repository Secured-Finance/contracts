# Solidity API

## IGenesisValueVault

### NoCompoundFactorExists

```solidity
error NoCompoundFactorExists(uint256 maturity)
```

### CompoundFactorIsZero

```solidity
error CompoundFactorIsZero()
```

### ResidualAmountIsNotZero

```solidity
error ResidualAmountIsNotZero()
```

### UnitPriceIsZero

```solidity
error UnitPriceIsZero()
```

### InvalidMaturity

```solidity
error InvalidMaturity()
```

### InvalidAmount

```solidity
error InvalidAmount()
```

### InvalidOrderFeeRate

```solidity
error InvalidOrderFeeRate()
```

### CurrencyAlreadyInitialized

```solidity
error CurrencyAlreadyInitialized()
```

### InitialCompoundFactorAlreadyFinalized

```solidity
error InitialCompoundFactorAlreadyFinalized()
```

### AutoRollLogAlreadyUpdated

```solidity
error AutoRollLogAlreadyUpdated(uint256 currentMaturity, uint256 nextMaturity)
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
event Transfer(bytes32 ccy, address from, address to, int256 value)
```

### AutoRollExecuted

```solidity
event AutoRollExecuted(bytes32 ccy, uint256 lendingCompoundFactor, uint256 borrowingCompoundFactor, uint256 unitPrice, uint256 currentMaturity, uint256 previousMaturity)
```

### BalanceLocked

```solidity
event BalanceLocked(bytes32 ccy, address user, uint256 value)
```

### BalanceUnlocked

```solidity
event BalanceUnlocked(bytes32 ccy, address user, uint256 value)
```

### isAutoRolled

```solidity
function isAutoRolled(bytes32 _ccy, uint256 _maturity) external view returns (bool)
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

### getBalance

```solidity
function getBalance(bytes32 ccy, address user) external view returns (int256)
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

### getTotalLockedBalance

```solidity
function getTotalLockedBalance(bytes32 ccy) external view returns (uint256)
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

### updateDecimals

```solidity
function updateDecimals(bytes32 _ccy, uint8 _decimals) external
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

### lock

```solidity
function lock(bytes32 ccy, address user, uint256 amount) external returns (uint256 lockedAmount)
```

### unlock

```solidity
function unlock(bytes32 ccy, address user, uint256 amount) external
```

### transferFrom

```solidity
function transferFrom(bytes32 ccy, address sender, address receiver, int256 amount) external
```

### cleanUpBalance

```solidity
function cleanUpBalance(bytes32 ccy, address user, uint256 maturity) external
```

### executeForcedReset

```solidity
function executeForcedReset(bytes32 _ccy, address _user) external
```

### executeForcedReset

```solidity
function executeForcedReset(bytes32 _ccy, uint256 _maturity, address _user, int256 _amountInFV) external returns (int256 removedAmount, int256 balance)
```

