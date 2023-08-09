# Solidity API

## DepositManagementLogic

### CalculatedFundVars

```solidity
struct CalculatedFundVars {
  uint256 plusDepositAmountInAdditionalFundsCcy;
  uint256 minusDepositAmountInAdditionalFundsCcy;
  uint256 workingLendOrdersAmount;
  uint256 collateralAmount;
  uint256 lentAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 debtAmount;
  uint256 borrowedAmount;
}
```

### isCovered

```solidity
function isCovered(address _user) public view returns (bool)
```

### getUsedCurrencies

```solidity
function getUsedCurrencies(address _user) public view returns (bytes32[])
```

### getDepositAmount

```solidity
function getDepositAmount(address _user, bytes32 _ccy) public view returns (uint256)
```

### getCollateralAmount

```solidity
function getCollateralAmount(address _user) public view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit)
```

### getCollateralAmount

```solidity
function getCollateralAmount(address _user, bytes32 _ccy) public view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit)
```

### getCoverage

```solidity
function getCoverage(address _user) external view returns (uint256 coverage)
```

### calculateCoverage

```solidity
function calculateCoverage(address _user, struct ILendingMarketController.AdditionalFunds _additionalFunds) public view returns (uint256 coverage, bool isInsufficientDepositAmount)
```

### _getCollateral

```solidity
function _getCollateral(address _user) internal view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit)
```

### _calculateCollateral

```solidity
function _calculateCollateral(address _user, struct ILendingMarketController.AdditionalFunds _funds) internal view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit, bool isInsufficientDepositAmount)
```

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(address _user) public view returns (uint256)
```

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(bytes32 _ccy, address _user) public view returns (uint256 withdrawableAmount)
```

### addDepositAmount

```solidity
function addDepositAmount(address _user, bytes32 _ccy, uint256 _amount) public
```

### removeDepositAmount

```solidity
function removeDepositAmount(address _user, bytes32 _ccy, uint256 _amount) public
```

### executeForcedReset

```solidity
function executeForcedReset(address _user, bytes32 _ccy) external returns (uint256 removedAmount)
```

### deposit

```solidity
function deposit(address _user, bytes32 _ccy, uint256 _amount) public
```

### withdraw

```solidity
function withdraw(address _user, bytes32 _ccy, uint256 _amount) public returns (uint256 withdrawableAmount)
```

### getLiquidationAmount

```solidity
function getLiquidationAmount(address _user, bytes32 _liquidationCcy, uint256 _liquidationAmountMaximum) public view returns (uint256 liquidationAmount, uint256 protocolFee, uint256 liquidatorFee)
```

### calculateLiquidationFees

```solidity
function calculateLiquidationFees(uint256 _amount) public view returns (uint256 protocolFee, uint256 liquidatorFee)
```

### transferFrom

```solidity
function transferFrom(bytes32 _ccy, address _from, address _to, uint256 _amount) external returns (uint256 untransferredAmount)
```

### _getTotalInternalDepositAmountInBaseCurrency

```solidity
function _getTotalInternalDepositAmountInBaseCurrency(address _user) internal view returns (uint256 totalDepositAmount)
```

Gets the total of amount deposited in the user's collateral of all currencies
 in this contract by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of collateral user |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalDepositAmount | uint256 | The total deposited amount in ETH |

### _updateUsedCurrencies

```solidity
function _updateUsedCurrencies(address _user, bytes32 _ccy) internal
```

