# Solidity API

## LiquidationLogic

### NoDebt

```solidity
error NoDebt(address user, bytes32 ccy, uint256 maturity)
```

### NoLiquidationAmount

```solidity
error NoLiquidationAmount(address user, bytes32 ccy)
```

### InvalidLiquidation

```solidity
error InvalidLiquidation()
```

### InvalidRepaymentAmount

```solidity
error InvalidRepaymentAmount()
```

### NotRepaymentPeriod

```solidity
error NotRepaymentPeriod()
```

### ExecuteLiquidationVars

```solidity
struct ExecuteLiquidationVars {
  uint256 liquidationAmountInCollateralCcy;
  uint256 liquidationAmountInDebtCcy;
  uint256 protocolFeeInCollateralCcy;
  uint256 liquidatorFeeInCollateralCcy;
  bool isDefaultMarket;
  uint256 receivedCollateralAmount;
}
```

### LiquidationExecuted

```solidity
event LiquidationExecuted(address user, bytes32 collateralCcy, bytes32 debtCcy, uint256 debtMaturity, uint256 debtAmount)
```

### ForcedRepaymentExecuted

```solidity
event ForcedRepaymentExecuted(address user, bytes32 collateralCcy, bytes32 debtCcy, uint256 debtMaturity, uint256 debtAmount)
```

### executeLiquidation

```solidity
function executeLiquidation(address _liquidator, address _user, bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity) external
```

### executeForcedRepayment

```solidity
function executeForcedRepayment(address _executor, address _user, bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity) external
```

### _transferCollateral

```solidity
function _transferCollateral(address _from, address _to, bytes32 _ccy, uint256 _amount) internal returns (uint256 untransferredAmount)
```

### _transferPositionsPerCurrency

```solidity
function _transferPositionsPerCurrency(address _from, address _to, bytes32 _ccy, int256 _amount) internal returns (int256 untransferredAmount)
```

### _transferPositionsPerMaturity

```solidity
function _transferPositionsPerMaturity(address _from, address _to, bytes32 _ccy, uint256 _maturity, int256 _amount, bool _isDefaultMarket) internal returns (int256 untransferredAmount)
```

### _transferGenesisValue

```solidity
function _transferGenesisValue(address _from, address _to, bytes32 _ccy, int256 _amount) internal returns (int256 untransferredAmount)
```

### _transferFutureValues

```solidity
function _transferFutureValues(address _from, address _to, bytes32 _ccy, uint256 _maturity, int256 _amount) internal returns (int256 untransferredAmount)
```

### _convertLiquidationAmounts

```solidity
function _convertLiquidationAmounts(bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _untransferredAmount, uint256 _receivedCollateralAmount, uint256 _liquidatorFeeInCollateralCcy) internal view returns (uint256 untransferredAmountInDebtCcy, uint256 receivedCollateralAmountInDebtCcy, uint256 liquidatorFeeInDebtCcy)
```

### _calculateTransferredAmount

```solidity
function _calculateTransferredAmount(uint256 totalAmount, uint256 untransferredAmount, uint256 feeAmount) internal pure returns (uint256)
```

