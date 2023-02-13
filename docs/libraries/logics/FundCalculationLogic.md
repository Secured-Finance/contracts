# Solidity API

## FundCalculationLogic

### UpdateOrderFeeRate

```solidity
event UpdateOrderFeeRate(uint256 previousRate, uint256 ratio)
```

### CalculatedAmountVars

```solidity
struct CalculatedAmountVars {
  address debtMarket;
  uint256 debtFVAmount;
  uint256 debtPVAmount;
  int256 futureValueAmount;
  uint256 estimatedDebtPVAmount;
  uint256 liquidationPVAmountInETH;
  uint256 liquidationPVAmount;
  uint256 offsetGVAmount;
}
```

### CalculatedTotalFundInETHVars

```solidity
struct CalculatedTotalFundInETHVars {
  bool[] isCollateral;
  bytes32 ccy;
  uint256[] amounts;
  uint256[] amountsInETH;
  uint256 plusDepositAmount;
  uint256 minusDepositAmount;
}
```

### updateOrderFeeRate

```solidity
function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) internal
```

### calculateOrderFeeAmount

```solidity
function calculateOrderFeeAmount(bytes32 _ccy, uint256 _amount, uint256 _maturity) public view returns (uint256 orderFeeAmount)
```

### convertToLiquidationAmountFromCollateral

```solidity
function convertToLiquidationAmountFromCollateral(address _liquidator, address _user, bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, uint24 _poolFee) public returns (uint256 liquidationPVAmount, uint256 offsetPVAmount)
```

### calculateActualFutureValue

```solidity
function calculateActualFutureValue(bytes32 _ccy, uint256 _maturity, address _user) public view returns (int256 futureValue)
```

### calculateActualPresentValue

```solidity
function calculateActualPresentValue(bytes32 _ccy, uint256 _maturity, address _user) public view returns (int256 presentValue)
```

### calculateActualPresentValue

```solidity
function calculateActualPresentValue(bytes32 _ccy, address _user) public view returns (int256 totalPresentValue)
```

### calculateLentFundsFromOrders

```solidity
function calculateLentFundsFromOrders(bytes32 _ccy, address _user) public view returns (uint256 totalWorkingOrdersAmount, uint256 totalClaimableAmount, uint256 totalLentAmount)
```

### calculateBorrowedFundsFromOrders

```solidity
function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _user) public view returns (uint256 totalWorkingOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount)
```

### calculateLentFundsFromOrders

```solidity
function calculateLentFundsFromOrders(bytes32 _ccy, address _market, address _user) public view returns (uint256 workingOrdersAmount, uint256 claimableAmount, uint256 lentAmount)
```

### calculateBorrowedFundsFromOrders

```solidity
function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _market, address _user) public view returns (uint256 workingOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### calculateFunds

```solidity
function calculateFunds(bytes32 _ccy, address _user) public view returns (uint256 workingLendOrdersAmount, uint256 claimableAmount, uint256 collateralAmount, uint256 lentAmount, uint256 workingBorrowOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### calculateTotalFundsInETH

```solidity
function calculateTotalFundsInETH(address _user, bytes32 _depositCcy, uint256 _depositAmount) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount, bool isEnoughDeposit)
```

### _calculateCurrentFVFromFVInMaturity

```solidity
function _calculateCurrentFVFromFVInMaturity(bytes32 _ccy, uint256 maturity, int256 futureValueInMaturity, address lendingMarketInMaturity) internal view returns (int256 futureValue)
```

### _calculateFVFromPV

```solidity
function _calculateFVFromPV(bytes32 _ccy, uint256 _maturity, uint256 _presentValue) internal view returns (uint256)
```

### _calculatePVFromFVInMaturity

```solidity
function _calculatePVFromFVInMaturity(bytes32 _ccy, uint256 maturity, int256 futureValueInMaturity, address lendingMarketInMaturity) internal view returns (int256 totalPresentValue)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice) internal pure returns (int256)
```

### _getTotalPresentValue

```solidity
function _getTotalPresentValue(bytes32 _ccy, address _user) internal view returns (int256 totalPresentValue)
```

### _calculateLentFundsFromOrders

```solidity
function _calculateLentFundsFromOrders(bytes32 _ccy, address _market, address _user) internal view returns (uint256 workingOrdersAmount, uint256 claimableAmount, uint256 lentAmount)
```

### _calculateBorrowedFundsFromOrders

```solidity
function _calculateBorrowedFundsFromOrders(bytes32 _ccy, address _market, address _user) internal view returns (uint256 workingOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### _offsetFutureValue

```solidity
function _offsetFutureValue(bytes32 _ccy, uint256 _maturity, address _lender, address _borrower, uint256 _maximumFVAmount) internal returns (uint256 offsetAmount)
```

### _offsetGenesisValue

```solidity
function _offsetGenesisValue(bytes32 _ccy, uint256 _maturity, address _lender, address _borrower, uint256 _maximumGVAmount) internal returns (uint256 offsetAmount)
```

