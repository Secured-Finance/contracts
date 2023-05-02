# Solidity API

## ITokenVault

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
function isCovered(address user, bytes32 ccy, uint256 unsettledExp, enum ProtocolTypes.Side unsettledOrderSide) external view returns (bool)
```

### isCovered

```solidity
function isCovered(address user) external view returns (bool)
```

### isCollateral

```solidity
function isCollateral(bytes32 _ccy) external view returns (bool)
```

### isCollateral

```solidity
function isCollateral(bytes32[] _ccys) external view returns (bool[] isCollateralCurrencies)
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
function getWithdrawableCollateral(address user) external view returns (uint256 maxWithdraw)
```

### getCoverage

```solidity
function getCoverage(address user) external view returns (uint256 coverage)
```

### getUnusedCollateral

```solidity
function getUnusedCollateral(address user) external view returns (uint256)
```

### getTotalCollateralAmount

```solidity
function getTotalCollateralAmount(address party) external view returns (uint256)
```

### getLiquidationAmount

```solidity
function getLiquidationAmount(address user, bytes32 liquidationCcy, uint256 liquidationAmountMaximum) external view returns (uint256 liquidationAmount, uint256 protocolFee, uint256 liquidatorFee, uint256 insolventAmount)
```

### getTotalDepositAmount

```solidity
function getTotalDepositAmount(bytes32 _ccy) external view returns (uint256)
```

### getDepositAmount

```solidity
function getDepositAmount(address user, bytes32 ccy) external view returns (uint256)
```

### getUsedCurrencies

```solidity
function getUsedCurrencies(address user) external view returns (bytes32[])
```

### getCollateralParameters

```solidity
function getCollateralParameters() external view returns (uint256 liquidationThresholdRate, uint256 liquidationProtocolFeeRate, uint256 liquidatorFeeRate)
```

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 liquidationThresholdRate, uint256 liquidationProtocolFeeRate, uint256 liquidatorFeeRate) external
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

### transferFrom

```solidity
function transferFrom(bytes32 _ccy, address _sender, address _receiver, uint256 _amount) external
```

