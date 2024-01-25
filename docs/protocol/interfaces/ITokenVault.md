# Solidity API

## ITokenVault

### UnregisteredCurrency

```solidity
error UnregisteredCurrency()
```

### InvalidCurrency

```solidity
error InvalidCurrency()
```

### InvalidToken

```solidity
error InvalidToken()
```

### InvalidAmount

```solidity
error InvalidAmount(bytes32 ccy, uint256 amount, uint256 msgValue)
```

### AmountIsZero

```solidity
error AmountIsZero()
```

### CallerNotBaseCurrency

```solidity
error CallerNotBaseCurrency(address caller)
```

### MarketTerminated

```solidity
error MarketTerminated()
```

### RedemptionIsRequired

```solidity
error RedemptionIsRequired()
```

### Deposit

```solidity
event Deposit(address user, bytes32 ccy, uint256 amount)
```

### Withdraw

```solidity
event Withdraw(address user, bytes32 ccy, uint256 amount)
```

### Transfer

```solidity
event Transfer(bytes32 ccy, address from, address to, uint256 amount)
```

### CurrencyRegistered

```solidity
event CurrencyRegistered(bytes32 ccy, address tokenAddress, bool isCollateral)
```

### CurrencyUpdated

```solidity
event CurrencyUpdated(bytes32 ccy, bool isCollateral)
```

### isCovered

```solidity
function isCovered(address user, bytes32 ccy) external view returns (bool isEnoughCollateral, bool isEnoughDepositInOrderCcy)
```

### isCollateral

```solidity
function isCollateral(bytes32 ccy) external view returns (bool)
```

### isCollateral

```solidity
function isCollateral(bytes32[] ccys) external view returns (bool[])
```

### isRegisteredCurrency

```solidity
function isRegisteredCurrency(bytes32 ccy) external view returns (bool)
```

### getTokenAddress

```solidity
function getTokenAddress(bytes32 ccy) external view returns (address)
```

### getCollateralCurrencies

```solidity
function getCollateralCurrencies() external view returns (bytes32[])
```

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(address user) external view returns (uint256)
```

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(bytes32 ccy, address user) external view returns (uint256)
```

### getCoverage

```solidity
function getCoverage(address user) external view returns (uint256)
```

### getTotalUnusedCollateralAmount

```solidity
function getTotalUnusedCollateralAmount(address user) external view returns (uint256)
```

### getTotalCollateralAmount

```solidity
function getTotalCollateralAmount(address user) external view returns (uint256)
```

### getCollateralAmount

```solidity
function getCollateralAmount(address user, bytes32 ccy) external view returns (uint256)
```

### getBorrowableAmount

```solidity
function getBorrowableAmount(address user, bytes32 ccy) external view returns (uint256)
```

### getLiquidationAmount

```solidity
function getLiquidationAmount(address user, bytes32 liquidationCcy, uint256 liquidationAmountMaximum) external view returns (uint256 liquidationAmount, uint256 protocolFee, uint256 liquidatorFee)
```

### getTotalDepositAmount

```solidity
function getTotalDepositAmount(bytes32 ccy) external view returns (uint256)
```

### getDepositAmount

```solidity
function getDepositAmount(address user, bytes32 ccy) external view returns (uint256)
```

### getUsedCurrencies

```solidity
function getUsedCurrencies(address user) external view returns (bytes32[])
```

### calculateCoverage

```solidity
function calculateCoverage(address user, struct ILendingMarketController.AdditionalFunds funds) external view returns (uint256 coverage, bool isInsufficientDepositAmount)
```

### calculateLiquidationFees

```solidity
function calculateLiquidationFees(uint256 liquidationAmount) external view returns (uint256 protocolFee, uint256 liquidatorFee)
```

### registerCurrency

```solidity
function registerCurrency(bytes32 ccy, address tokenAddress, bool isCollateral) external
```

### updateCurrency

```solidity
function updateCurrency(bytes32 ccy, bool isCollateral) external
```

### deposit

```solidity
function deposit(bytes32 ccy, uint256 amount) external payable
```

### depositFrom

```solidity
function depositFrom(address user, bytes32 ccy, uint256 amount) external payable
```

### withdraw

```solidity
function withdraw(bytes32 ccy, uint256 amount) external
```

### addDepositAmount

```solidity
function addDepositAmount(address user, bytes32 ccy, uint256 amount) external
```

### removeDepositAmount

```solidity
function removeDepositAmount(address user, bytes32 ccy, uint256 amount) external
```

### cleanUpUsedCurrencies

```solidity
function cleanUpUsedCurrencies(address user, bytes32 ccy) external
```

### executeForcedReset

```solidity
function executeForcedReset(address user, bytes32 ccy) external returns (uint256 removedAmount)
```

### transferFrom

```solidity
function transferFrom(bytes32 ccy, address sender, address receiver, uint256 amount) external returns (uint256 untransferredAmount)
```

### pause

```solidity
function pause() external
```

### unpause

```solidity
function unpause() external
```

