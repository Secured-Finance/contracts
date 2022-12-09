# Solidity API

## FundCalculationLogic

### CalculatedAmountVars

```solidity
struct CalculatedAmountVars {
  uint256 debtFVAmount;
  uint256 debtPVAmount;
  uint256 estimatedDebtPVAmount;
  uint256 liquidationPVAmount;
}
```

### convertToLiquidationAmountFromCollateral

```solidity
function convertToLiquidationAmountFromCollateral(bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, address _user, uint24 _poolFee) public returns (uint256)
```

### getFutureValue

```solidity
function getFutureValue(bytes32 _ccy, uint256 _maturity, address _user) public view returns (int256 amount, uint256 maturity)
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
function calculateTotalFundsInETH(address _user) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount)
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

