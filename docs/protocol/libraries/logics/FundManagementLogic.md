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

### CalculatedTotalFundInBaseCurrencyVars

```solidity
struct CalculatedTotalFundInBaseCurrencyVars {
  bool[] isCollateral;
  bytes32 ccy;
  uint256[] amounts;
  uint256[] amountsInBaseCurrency;
  uint256 plusDepositAmount;
  uint256 minusDepositAmount;
}
```

### ActualFunds

```solidity
struct ActualFunds {
  int256 presentValue;
  uint256 claimableAmount;
  uint256 debtAmount;
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
  int256 presentValueOfDefaultMarket;
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

### RedemptionCompleted

```solidity
event RedemptionCompleted(address user, uint256 amount)
```

### LiquidationExecuted

```solidity
event LiquidationExecuted(address user, bytes32 collateralCcy, bytes32 debtCcy, uint256 debtMaturity, uint256 debtAmount)
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
function executeLiquidation(address _liquidator, address _user, bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity) external
```

### updateFunds

```solidity
function updateFunds(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledAmount, uint256 _filledAmountInFV, uint256 _orderFeeRate, bool _isTaker) external
```

### registerCurrencyAndMaturity

```solidity
function registerCurrencyAndMaturity(bytes32 _ccy, uint256 _maturity, address _user) public
```

### executeRedemption

```solidity
function executeRedemption(address _user) external
```

### calculateActualFunds

```solidity
function calculateActualFunds(bytes32 _ccy, uint256 _maturity, address _user) public view returns (struct FundManagementLogic.ActualFunds actualFunds)
```

### calculateFunds

```solidity
function calculateFunds(bytes32 _ccy, address _user) public view returns (uint256 workingLendOrdersAmount, uint256 claimableAmount, uint256 collateralAmount, uint256 lentAmount, uint256 workingBorrowOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### calculateTotalFundsInBaseCurrency

```solidity
function calculateTotalFundsInBaseCurrency(address _user, bytes32 _depositCcy, uint256 _depositAmount) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount, bool isEnoughDeposit)
```

### getUsedMaturities

```solidity
function getUsedMaturities(bytes32 _ccy, address _user) public view returns (uint256[] maturities)
```

### getPositions

```solidity
function getPositions(bytes32[] _ccys, address _user) external view returns (struct ILendingMarketController.Position[] positions)
```

### getPositionsPerCurrency

```solidity
function getPositionsPerCurrency(bytes32 _ccy, address _user) public view returns (struct ILendingMarketController.Position[] positions)
```

### getPosition

```solidity
function getPosition(bytes32 _ccy, uint256 _maturity, address _user) public view returns (int256 presentValue, int256 futureValue)
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

### _convertToBaseCurrencyAtMarketTerminationPrice

```solidity
function _convertToBaseCurrencyAtMarketTerminationPrice(bytes32 _ccy, int256 _amount) internal view returns (int256)
```

### _convertFromBaseCurrencyAtMarketTerminationPrice

```solidity
function _convertFromBaseCurrencyAtMarketTerminationPrice(bytes32 _ccy, uint256 _amount) internal view returns (uint256)
```

### _transferFunds

```solidity
function _transferFunds(address _from, address _to, bytes32 _ccy, int256 _amount) internal returns (int256 untransferredAmount)
```

### _transferFunds

```solidity
function _transferFunds(address _from, address _to, bytes32 _ccy, uint256 _maturity, int256 _amount, bool _isDefaultMarket) internal returns (int256 untransferredAmount)
```

### _calculateOrderFeeAmount

```solidity
function _calculateOrderFeeAmount(uint256 _maturity, uint256 _amount, uint256 _orderFeeRate) internal view returns (uint256 orderFeeAmount)
```

### _resetFunds

```solidity
function _resetFunds(bytes32 _ccy, address _user) internal returns (int256 amount)
```

