# Solidity API

## FundManagementLogic

### BASE_MIN_DEBT_UNIT_PRICE

```solidity
uint256 BASE_MIN_DEBT_UNIT_PRICE
```

### NotRedemptionPeriod

```solidity
error NotRedemptionPeriod()
```

### NotRepaymentPeriod

```solidity
error NotRepaymentPeriod()
```

### NoRedemptionAmount

```solidity
error NoRedemptionAmount()
```

### NoRepaymentAmount

```solidity
error NoRepaymentAmount()
```

### AlreadyRedeemed

```solidity
error AlreadyRedeemed()
```

### InsufficientCollateral

```solidity
error InsufficientCollateral()
```

### CalculatedTotalFundInBaseCurrencyVars

```solidity
struct CalculatedTotalFundInBaseCurrencyVars {
  address user;
  struct ILendingMarketController.AdditionalFunds additionalFunds;
  uint256 liquidationThresholdRate;
  bool[] isCollateral;
  bytes32[] ccys;
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
  bool isDefaultMarket;
  uint8 orderBookId;
  uint8 defaultOrderBookId;
  uint256 defaultOrderBookMarketUnitPrice;
  uint256[] maturities;
  int256 presentValueOfDefaultMarket;
  contract ILendingMarket market;
  contract IFutureValueVault futureValueVault;
  uint256 minDebtUnitPrice;
  uint256 defaultOrderBookMinDebtUnitPrice;
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
event OrderFilled(address taker, bytes32 ccy, enum ProtocolTypes.Side side, uint256 maturity, uint256 amount, uint256 amountInFV, uint256 feeInFV)
```

### OrdersFilledInAsync

```solidity
event OrdersFilledInAsync(address taker, bytes32 ccy, enum ProtocolTypes.Side side, uint256 maturity, uint256 amount, uint256 amountInFV)
```

### OrderPartiallyFilled

```solidity
event OrderPartiallyFilled(uint48 orderId, address maker, bytes32 ccy, enum ProtocolTypes.Side side, uint256 maturity, uint256 amount, uint256 amountInFV)
```

### RedemptionExecuted

```solidity
event RedemptionExecuted(address user, bytes32 ccy, uint256 maturity, uint256 amount)
```

### RepaymentExecuted

```solidity
event RepaymentExecuted(address user, bytes32 ccy, uint256 maturity, uint256 amount)
```

### EmergencySettlementExecuted

```solidity
event EmergencySettlementExecuted(address user, uint256 amount)
```

### convertFutureValueToGenesisValue

```solidity
function convertFutureValueToGenesisValue(bytes32 _ccy, uint8 _orderBookId, uint256 _maturity, address _user) public returns (int256)
```

Converts the future value to the genesis value if there is balance in the past maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |
| _orderBookId | uint8 |  |
| _maturity | uint256 |  |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | Current future value amount after update |

### updateFunds

```solidity
function updateFunds(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledAmount, uint256 _filledAmountInFV, uint256 _feeInFV) external
```

### registerCurrencyAndMaturity

```solidity
function registerCurrencyAndMaturity(bytes32 _ccy, uint256 _maturity, address _user) public
```

### registerCurrency

```solidity
function registerCurrency(bytes32 _ccy, address _user) public
```

### executeRedemption

```solidity
function executeRedemption(bytes32 _ccy, uint256 _maturity, address _user) external
```

### executeRepayment

```solidity
function executeRepayment(bytes32 _ccy, uint256 _maturity, address _user, uint256 _amount) public returns (uint256 repaymentAmount)
```

### executeEmergencySettlement

```solidity
function executeEmergencySettlement(address _user) external
```

### getActualFunds

```solidity
function getActualFunds(bytes32 _ccy, uint256 _maturity, address _user, uint256 _minDebtUnitPrice) public view returns (struct FundManagementLogic.ActualFunds actualFunds)
```

### getCurrentMinDebtUnitPrice

```solidity
function getCurrentMinDebtUnitPrice(uint256 _maturity, uint256 _minDebtUnitPrice) public view returns (uint256)
```

### calculateFunds

```solidity
function calculateFunds(bytes32 _ccy, address _user, struct ILendingMarketController.AdditionalFunds _additionalFunds, uint256 _liquidationThresholdRate) public view returns (struct ILendingMarketController.CalculatedFunds funds)
```

### calculateTotalFundsInBaseCurrency

```solidity
function calculateTotalFundsInBaseCurrency(address _user, struct ILendingMarketController.AdditionalFunds _additionalFunds, uint256 _liquidationThresholdRate) external view returns (struct ILendingMarketController.CalculatedTotalFunds totalFunds)
```

### getUsedMaturities

```solidity
function getUsedMaturities(bytes32 _ccy, address _user) public view returns (uint256[] maturities)
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
function _cleanUpOrders(bytes32 _ccy, uint256 _maturity, address _user) internal returns (uint256 activeOrderCount)
```

### _getFundsFromFutureValueVault

```solidity
function _getFundsFromFutureValueVault(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint8 currentOrderBookId, uint256 currentMaturity, bool isDefaultMarket) internal view returns (struct FundManagementLogic.FutureValueVaultFunds funds)
```

### _getFundsFromInactiveBorrowOrders

```solidity
function _getFundsFromInactiveBorrowOrders(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint8 currentOrderBookId, uint256 currentMaturity, bool isDefaultMarket) internal view returns (struct FundManagementLogic.InactiveBorrowOrdersFunds funds)
```

### _getFundsFromInactiveLendOrders

```solidity
function _getFundsFromInactiveLendOrders(bytes32 _ccy, address _user, struct FundManagementLogic.CalculateActualFundsVars vars, uint8 currentOrderBookId, uint256 currentMaturity, bool isDefaultMarket) internal view returns (struct FundManagementLogic.InactiveLendOrdersFunds funds)
```

### _convertFVtoOtherMaturity

```solidity
function _convertFVtoOtherMaturity(bytes32 _ccy, contract ILendingMarket _market, uint256 _fromMaturity, int256 _fromFutureValue, uint256 _toUnitPrice) internal view returns (int256 presentValue, int256 futureValue)
```

### calculatePVFromFV

```solidity
function calculatePVFromFV(bytes32 _ccy, uint256 _maturity, int256 _futureValue) public view returns (int256 presentValue)
```

### calculateFVFromPV

```solidity
function calculateFVFromPV(bytes32 _ccy, uint256 _maturity, int256 _presentValue) public view returns (int256 futureValue)
```

### _convertToBaseCurrencyAtMarketTerminationPrice

```solidity
function _convertToBaseCurrencyAtMarketTerminationPrice(bytes32 _ccy, int256 _amount) internal view returns (int256)
```

### _convertFromBaseCurrencyAtMarketTerminationPrice

```solidity
function _convertFromBaseCurrencyAtMarketTerminationPrice(bytes32 _ccy, uint256 _amount) internal view returns (uint256)
```

### _resetFundsPerCurrency

```solidity
function _resetFundsPerCurrency(bytes32 _ccy, address _user) internal returns (int256 amount)
```

### _resetFundsPerMaturity

```solidity
function _resetFundsPerMaturity(bytes32 _ccy, uint256 _maturity, address _user, int256 _amount) internal returns (int256 totalRemovedAmount)
```

### _getDefaultOrderBookMinDebtUnitPrice

```solidity
function _getDefaultOrderBookMinDebtUnitPrice(struct FundManagementLogic.CalculateActualFundsVars vars) private view returns (uint256)
```

### _getDefaultOrderBookMarketUnitPrice

```solidity
function _getDefaultOrderBookMarketUnitPrice(struct FundManagementLogic.CalculateActualFundsVars vars) private view returns (uint256)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(contract ILendingMarket _market, uint8 _orderBookId, int256 _futureValue) internal view returns (int256 presentValue)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice) internal pure returns (int256)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(uint256 _futureValue, uint256 _unitPrice) internal pure returns (uint256)
```

### _calculateFVFromPV

```solidity
function _calculateFVFromPV(int256 _presentValue, uint256 _unitPrice) internal pure returns (int256)
```

