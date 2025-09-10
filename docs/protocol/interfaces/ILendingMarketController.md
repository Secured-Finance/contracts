# Solidity API

## ILendingMarketController

### InvalidMaturity

```solidity
error InvalidMaturity()
```

### InvalidCurrency

```solidity
error InvalidCurrency()
```

### MarketTerminated

```solidity
error MarketTerminated()
```

### NotTerminated

```solidity
error NotTerminated()
```

### AlreadyInitialized

```solidity
error AlreadyInitialized()
```

### AdditionalFunds

```solidity
struct AdditionalFunds {
  bytes32 ccy;
  uint256 workingLendOrdersAmount;
  uint256 claimableAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 debtAmount;
  uint256 lentAmount;
  uint256 borrowedAmount;
}
```

### CalculatedTotalFunds

```solidity
struct CalculatedTotalFunds {
  uint256 plusDepositAmountInAdditionalFundsCcy;
  uint256 minusDepositAmountInAdditionalFundsCcy;
  uint256 workingLendOrdersAmount;
  uint256 claimableAmount;
  uint256 collateralAmount;
  uint256 lentAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 debtAmount;
  uint256 borrowedAmount;
}
```

### CalculatedFunds

```solidity
struct CalculatedFunds {
  uint256 workingLendOrdersAmount;
  uint256 claimableAmount;
  uint256 collateralAmount;
  uint256 unallocatedCollateralAmount;
  uint256 lentAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 debtAmount;
  uint256 borrowedAmount;
}
```

### GetOrderEstimationParams

```solidity
struct GetOrderEstimationParams {
  bytes32 ccy;
  uint256 maturity;
  address user;
  enum ProtocolTypes.Side side;
  uint256 amount;
  uint256 unitPrice;
  uint256 additionalDepositAmount;
  bool ignoreBorrowedAmount;
}
```

### GetOrderEstimationFromFVParams

```solidity
struct GetOrderEstimationFromFVParams {
  bytes32 ccy;
  uint256 maturity;
  address user;
  enum ProtocolTypes.Side side;
  uint256 amountInFV;
  uint256 additionalDepositAmount;
  bool ignoreBorrowedAmount;
}
```

### isValidMaturity

```solidity
function isValidMaturity(bytes32 _ccy, uint256 _maturity) external view returns (bool)
```

### isTerminated

```solidity
function isTerminated() external view returns (bool)
```

### isRedemptionRequired

```solidity
function isRedemptionRequired(address _user) external view returns (bool)
```

### getMarketBasePeriod

```solidity
function getMarketBasePeriod() external view returns (uint256)
```

### getTerminationDate

```solidity
function getTerminationDate() external view returns (uint256)
```

### getTerminationCurrencyCache

```solidity
function getTerminationCurrencyCache(bytes32 _ccy) external view returns (struct TerminationCurrencyCache)
```

### getTerminationCollateralRatio

```solidity
function getTerminationCollateralRatio(bytes32 _ccy) external view returns (uint256)
```

### getMinDebtUnitPrice

```solidity
function getMinDebtUnitPrice(bytes32 _ccy) external view returns (uint256)
```

### getCurrentMinDebtUnitPrice

```solidity
function getCurrentMinDebtUnitPrice(bytes32 _ccy, uint256 _maturity) external view returns (uint256)
```

### getGenesisDate

```solidity
function getGenesisDate(bytes32 ccy) external view returns (uint256)
```

### getLendingMarket

```solidity
function getLendingMarket(bytes32 ccy) external view returns (address)
```

### getFutureValueVault

```solidity
function getFutureValueVault(bytes32 ccy) external view returns (address)
```

### getOrderBookId

```solidity
function getOrderBookId(bytes32 _ccy, uint256 _maturity) external view returns (uint8)
```

### getPendingOrderAmount

```solidity
function getPendingOrderAmount(bytes32 _ccy, uint256 _maturity) external view returns (uint256)
```

### getOrderEstimation

```solidity
function getOrderEstimation(struct ILendingMarketController.GetOrderEstimationParams params) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount, uint256 coverage, bool isInsufficientDepositAmount)
```

### getMaturities

```solidity
function getMaturities(bytes32 ccy) external view returns (uint256[])
```

### getOrderBookIds

```solidity
function getOrderBookIds(bytes32 ccy) external view returns (uint8[])
```

### getUsedCurrencies

```solidity
function getUsedCurrencies(address user) external view returns (bytes32[])
```

### getTotalPresentValue

```solidity
function getTotalPresentValue(bytes32 ccy, address user) external view returns (int256)
```

### getTotalPresentValueInBaseCurrency

```solidity
function getTotalPresentValueInBaseCurrency(address user) external view returns (int256 totalPresentValue)
```

### getGenesisValue

```solidity
function getGenesisValue(bytes32 ccy, address user) external view returns (int256 amount, int256 amountInPV, int256 amountInFV)
```

### getPosition

```solidity
function getPosition(bytes32 _ccy, uint256 _maturity, address _user) external view returns (int256 presentValue, int256 futureValue)
```

### getZCToken

```solidity
function getZCToken(bytes32 ccy, uint256 maturity) external view returns (address)
```

### getZCTokenInfo

```solidity
function getZCTokenInfo(address zcToken) external view returns (struct ZCTokenInfo)
```

### getWithdrawableZCTokenAmount

```solidity
function getWithdrawableZCTokenAmount(bytes32 ccy, uint256 maturity, address user) external view returns (uint256 amount)
```

### calculateFunds

```solidity
function calculateFunds(bytes32 ccy, address user, uint256 liquidationThresholdRate) external view returns (struct ILendingMarketController.CalculatedFunds funds)
```

### calculateTotalFundsInBaseCurrency

```solidity
function calculateTotalFundsInBaseCurrency(address user, struct ILendingMarketController.AdditionalFunds _additionalFunds, uint256 liquidationThresholdRate) external view returns (struct ILendingMarketController.CalculatedTotalFunds calculatedFunds)
```

### isInitializedLendingMarket

```solidity
function isInitializedLendingMarket(bytes32 ccy) external view returns (bool)
```

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 ccy, uint256 genesisDate, uint256 compoundFactor, uint256 orderFeeRate, uint256 circuitBreakerLimitRange, uint256 minDebtUnitPrice) external
```

### createOrderBook

```solidity
function createOrderBook(bytes32 ccy, uint256 openingDate, uint256 preOpeningDate) external
```

### executeOrder

```solidity
function executeOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external returns (bool)
```

### depositAndExecuteOrder

```solidity
function depositAndExecuteOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external payable returns (bool)
```

### depositWithPermitAndExecuteOrder

```solidity
function depositWithPermitAndExecuteOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS) external returns (bool)
```

### executePreOrder

```solidity
function executePreOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external returns (bool)
```

### depositAndExecutesPreOrder

```solidity
function depositAndExecutesPreOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external payable returns (bool)
```

### depositWithPermitAndExecutePreOrder

```solidity
function depositWithPermitAndExecutePreOrder(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice, uint256 _deadline, uint8 _permitV, bytes32 _permitR, bytes32 _permitS) external returns (bool)
```

### unwindPosition

```solidity
function unwindPosition(bytes32 ccy, uint256 maturity) external returns (bool)
```

### unwindPositionWithCap

```solidity
function unwindPositionWithCap(bytes32 ccy, uint256 maturity, uint256 maxFutureValue) external returns (uint256 filledAmount, uint256 filledAmountInFV, uint256 feeInFV)
```

### executeItayoseCall

```solidity
function executeItayoseCall(bytes32 ccy, uint256 maturity) external returns (bool)
```

### executeRedemption

```solidity
function executeRedemption(bytes32 _ccy, uint256 _maturity) external returns (bool)
```

### executeRepayment

```solidity
function executeRepayment(bytes32 _ccy, uint256 _maturity) external returns (bool)
```

### executeEmergencySettlement

```solidity
function executeEmergencySettlement() external returns (bool)
```

### executeLiquidationCall

```solidity
function executeLiquidationCall(bytes32 collateralCcy, bytes32 debtCcy, uint256 debtMaturity, address user) external returns (bool)
```

### executeForcedRepayment

```solidity
function executeForcedRepayment(bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, address _user) external returns (bool)
```

### cancelOrder

```solidity
function cancelOrder(bytes32 ccy, uint256 maturity, uint48 orderId) external returns (bool)
```

### rotateOrderBooks

```solidity
function rotateOrderBooks(bytes32 ccy) external
```

### executeEmergencyTermination

```solidity
function executeEmergencyTermination() external
```

### pauseLendingMarket

```solidity
function pauseLendingMarket(bytes32 ccy) external returns (bool)
```

### unpauseLendingMarket

```solidity
function unpauseLendingMarket(bytes32 ccy) external returns (bool)
```

### cleanUpAllFunds

```solidity
function cleanUpAllFunds(address user) external returns (bool)
```

### cleanUpFunds

```solidity
function cleanUpFunds(bytes32 ccy, address user) external returns (uint256 activeOrderCount)
```

### updateMinDebtUnitPrice

```solidity
function updateMinDebtUnitPrice(bytes32 _ccy, uint256 _minDebtUnitPrice) external
```

### withdrawZCToken

```solidity
function withdrawZCToken(bytes32 _ccy, uint256 _maturity, uint256 _amount) external
```

### depositZCToken

```solidity
function depositZCToken(bytes32 _ccy, uint256 _maturity, uint256 _amount) external
```

