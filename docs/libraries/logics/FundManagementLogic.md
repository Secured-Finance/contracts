# Solidity API

## FundManagementLogic

### CalculatedAmountVars

```solidity
struct CalculatedAmountVars {
  address debtMarket;
  uint256 debtFVAmount;
  uint256 debtPVAmount;
  int256 futureValueAmount;
  uint256 estimatedLiquidationPVAmount;
  uint256 liquidationPVAmountInETH;
  uint256 liquidationFVAmount;
  int256 offsetGVAmount;
  uint256 offsetFVAmount;
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

### ActualFunds

```solidity
struct ActualFunds {
  int256 presentValue;
  int256 futureValue;
  uint256 workingLendingOrdersAmount;
  uint256 lentAmount;
  uint256 workingBorrowingOrdersAmount;
  uint256 borrowedAmount;
  int256 genesisValue;
}
```

### CalculateActualFundsVars

```solidity
struct CalculateActualFundsVars {
  bool isTotal;
  address market;
  uint256 maturity;
  bool isDefaultMarket;
  uint256[] maturities;
}
```

### FutureValueVaultFunds

```solidity
struct FutureValueVaultFunds {
  int256 genesisValue;
  int256 presentValue;
  int256 futureValue;
}
```

### InactiveBorrowingOrdersFunds

```solidity
struct InactiveBorrowingOrdersFunds {
  int256 genesisValue;
  int256 presentValue;
  int256 futureValue;
  uint256 workingBorrowingOrdersAmount;
  uint256 borrowedAmount;
}
```

### InactiveLendingOrdersFunds

```solidity
struct InactiveLendingOrdersFunds {
  int256 genesisValue;
  int256 presentValue;
  int256 futureValue;
  uint256 workingLendingOrdersAmount;
  uint256 lentAmount;
}
```

### convertFutureValueToGenesisValue

```solidity
function convertFutureValueToGenesisValue(bytes32 _ccy, uint256 _maturity, address _user) external returns (int256)
```

Converts the future value to the genesis value if there is balance in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |
| _maturity | uint256 |  |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | Current future value amount after update |

### convertToLiquidationAmountFromCollateral

```solidity
function convertToLiquidationAmountFromCollateral(address _liquidator, address _user, bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, uint24 _poolFee) external returns (uint256 liquidationPVAmount, uint256 offsetPVAmount)
```

### updateDepositAmount

```solidity
function updateDepositAmount(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledFutureValue, uint256 _filledAmount, uint256 _feeFutureValue) external
```

### calculateActualFunds

```solidity
function calculateActualFunds(bytes32 _ccy, uint256 _maturity, address _user) public view returns (struct FundManagementLogic.ActualFunds actualFunds)
```

### calculateFunds

```solidity
function calculateFunds(bytes32 _ccy, address _user) public view returns (uint256 workingLendOrdersAmount, uint256 claimableAmount, uint256 collateralAmount, uint256 lentAmount, uint256 workingBorrowOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### calculateTotalFundsInETH

```solidity
function calculateTotalFundsInETH(address _user, bytes32 _depositCcy, uint256 _depositAmount) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount, bool isEnoughDeposit)
```

### getUsedMaturities

```solidity
function getUsedMaturities(bytes32 _ccy, address _user) public view returns (uint256[] maturities)
```

### _getFundsFromFutureValueVault

```solidity
function _getFundsFromFutureValueVault(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint256 currentMaturity, address currentMarket, bool isDefaultMarket) internal view returns (struct FundManagementLogic.FutureValueVaultFunds funds)
```

### _getFundsFromInactiveBorrowingOrders

```solidity
function _getFundsFromInactiveBorrowingOrders(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint256 currentMaturity, address currentMarket, bool isDefaultMarket) internal view returns (struct FundManagementLogic.InactiveBorrowingOrdersFunds funds)
```

### _getFundsFromInactiveLendingOrders

```solidity
function _getFundsFromInactiveLendingOrders(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint256 currentMaturity, address currentMarket, bool isDefaultMarket) internal view returns (struct FundManagementLogic.InactiveLendingOrdersFunds funds)
```

### _calculatePVandFVFromFVInMaturity

```solidity
function _calculatePVandFVFromFVInMaturity(bytes32 _ccy, uint256 _basisMaturity, uint256 _destinationMaturity, int256 _futureValueInBasisMaturity) internal view returns (int256 presetValue, int256 futureValue)
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

### _offsetFutureValue

```solidity
function _offsetFutureValue(bytes32 _ccy, uint256 _maturity, address _lender, address _borrower, uint256 _maximumFVAmount) internal returns (uint256 offsetAmount)
```

