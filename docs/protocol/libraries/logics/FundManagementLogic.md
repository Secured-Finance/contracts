# Solidity API

## FundManagementLogic

### ExecuteLiquidationVars

```solidity
struct ExecuteLiquidationVars {
  address reserveFund;
  uint256 liquidationAmountInCollateralCcy;
  uint256 protocolFeeInCollateralCcy;
  uint256 liquidatorFeeInCollateralCcy;
  bool isDefaultMarket;
  bool isReserveFundPaused;
  uint256 receivedCollateralAmount;
  uint256 receivedDebtAmount;
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
  uint256 workingLendOrdersAmount;
  uint256 lentAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 borrowedAmount;
  int256 genesisValue;
}
```

### CalculateActualFundsVars

```solidity
struct CalculateActualFundsVars {
  bool isTotal;
  address market;
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

### InactiveBorrowOrdersFunds

```solidity
struct InactiveBorrowOrdersFunds {
  int256 genesisValue;
  int256 presentValue;
  int256 futureValue;
  uint256 workingOrdersAmount;
  uint256 borrowedAmount;
}
```

### InactiveLendOrdersFunds

```solidity
struct InactiveLendOrdersFunds {
  int256 genesisValue;
  int256 presentValue;
  int256 futureValue;
  uint256 workingOrdersAmount;
  uint256 lentAmount;
}
```

### OrderFilled

```solidity
event OrderFilled(address taker, bytes32 ccy, enum ProtocolTypes.Side side, uint256 maturity, uint256 amount, uint256 futureValue)
```

### OrdersFilledInAsync

```solidity
event OrdersFilledInAsync(address taker, bytes32 ccy, enum ProtocolTypes.Side side, uint256 maturity, uint256 amount, uint256 futureValue)
```

### convertFutureValueToGenesisValue

```solidity
function convertFutureValueToGenesisValue(bytes32 _ccy, uint256 _maturity, address _user) public returns (int256)
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

### executeLiquidation

```solidity
function executeLiquidation(address _liquidator, address _user, bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity) external returns (uint256 totalLiquidatedDebtAmount)
```

### updateFunds

```solidity
function updateFunds(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledFutureValue, uint256 _filledAmount, uint256 _feeFutureValue, bool _isTaker) external
```

### registerCurrencyAndMaturity

```solidity
function registerCurrencyAndMaturity(bytes32 _ccy, uint256 _maturity, address _user) public
```

### resetFunds

```solidity
function resetFunds(bytes32 _ccy, address _user) external returns (int256 amount)
```

### addDepositAtMarketTerminationPrice

```solidity
function addDepositAtMarketTerminationPrice(bytes32 _ccy, address _user, uint256 _amount) external
```

### removeDepositAtMarketTerminationPrice

```solidity
function removeDepositAtMarketTerminationPrice(bytes32 _ccy, address _user, uint256 _amount, bytes32 _collateralCcy) external
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

### cleanUpAllFunds

```solidity
function cleanUpAllFunds(address _user) external
```

### cleanUpFunds

```solidity
function cleanUpFunds(bytes32 _ccy, address _user) public returns (uint256 totalActiveOrderCount)
```

### _cleanUpOrders

```solidity
function _cleanUpOrders(bytes32 _ccy, uint256 _maturity, address _user) internal returns (uint256 activeOrderCount, bool isCleaned)
```

### _getFundsFromFutureValueVault

```solidity
function _getFundsFromFutureValueVault(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint256 currentMaturity, address currentMarket, bool isDefaultMarket) internal view returns (struct FundManagementLogic.FutureValueVaultFunds funds)
```

### _getFundsFromInactiveBorrowOrders

```solidity
function _getFundsFromInactiveBorrowOrders(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint256 currentMaturity, address currentMarket, bool isDefaultMarket) internal view returns (struct FundManagementLogic.InactiveBorrowOrdersFunds funds)
```

### _getFundsFromInactiveLendOrders

```solidity
function _getFundsFromInactiveLendOrders(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint256 currentMaturity, address currentMarket, bool isDefaultMarket) internal view returns (struct FundManagementLogic.InactiveLendOrdersFunds funds)
```

### _calculatePVandFVInDefaultMarket

```solidity
function _calculatePVandFVInDefaultMarket(bytes32 _ccy, uint256 _maturity, int256 _futureValueInMaturity) internal view returns (int256 presentValue, int256 futureValue)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(bytes32 _ccy, uint256 _maturity, int256 _futureValue) internal view returns (int256 presentValue)
```

### _calculateFVFromPV

```solidity
function _calculateFVFromPV(bytes32 _ccy, uint256 _maturity, int256 _presentValue) internal view returns (int256)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice) internal pure returns (int256)
```

### _convertToETHAtMarketTerminationPrice

```solidity
function _convertToETHAtMarketTerminationPrice(bytes32 _ccy, uint256 _amount) internal view returns (uint256)
```

### _convertFromETHAtMarketTerminationPrice

```solidity
function _convertFromETHAtMarketTerminationPrice(bytes32 _ccy, uint256 _amount) internal view returns (uint256)
```

### _transferFunds

```solidity
function _transferFunds(address _from, address _to, bytes32 _ccy, int256 _amount) internal returns (int256 untransferredAmount)
```

### _transferFunds

```solidity
function _transferFunds(address _from, address _to, bytes32 _ccy, uint256 _maturity, int256 _amount, bool _isDefaultMarket) internal returns (int256 untransferredAmount)
```

