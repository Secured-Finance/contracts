# Solidity API

## ILendingMarketController

### Order

```solidity
struct Order {
  uint48 orderId;
  bytes32 ccy;
  uint256 maturity;
  enum ProtocolTypes.Side side;
  uint256 unitPrice;
  uint256 amount;
  uint256 timestamp;
  bool isPreOrder;
}
```

### Position

```solidity
struct Position {
  bytes32 ccy;
  uint256 maturity;
  int256 presentValue;
  int256 futureValue;
}
```

### OrderBookDetail

```solidity
struct OrderBookDetail {
  bytes32 ccy;
  uint256 maturity;
  uint256 bestLendUnitPrice;
  uint256 bestBorrowUnitPrice;
  uint256 midUnitPrice;
  uint256 maxLendUnitPrice;
  uint256 minBorrowUnitPrice;
  uint256 openingUnitPrice;
  uint256 openingDate;
  bool isReady;
}
```

### AdditionalFunds

```solidity
struct AdditionalFunds {
  bytes32 ccy;
  uint256 claimableAmount;
  uint256 debtAmount;
  uint256 lentAmount;
  uint256 borrowedAmount;
}
```

### isTerminated

```solidity
function isTerminated() external view returns (bool)
```

### isRedemptionRequired

```solidity
function isRedemptionRequired(address _user) external view returns (bool)
```

### getGenesisDate

```solidity
function getGenesisDate(bytes32 ccy) external view returns (uint256)
```

### getLendingMarket

```solidity
function getLendingMarket(bytes32 ccy) external view returns (address)
```

### getOrderBookId

```solidity
function getOrderBookId(bytes32 _ccy, uint256 _maturity) external view returns (uint8)
```

### getOrderBookDetail

```solidity
function getOrderBookDetail(bytes32 _ccy, uint256 _maturity) external view returns (uint256 bestLendUnitPrice, uint256 bestBorrowUnitPrice, uint256 midUnitPrice, uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice, uint256 openingUnitPrice, uint256 openingDate, bool isReady)
```

### getOrderBookDetails

```solidity
function getOrderBookDetails(bytes32[] _ccys) external view returns (struct ILendingMarketController.OrderBookDetail[] orderBookDetails)
```

### getFutureValueVault

```solidity
function getFutureValueVault(bytes32 ccy, uint256 maturity) external view returns (address)
```

### getBestLendUnitPrices

```solidity
function getBestLendUnitPrices(bytes32 ccy) external view returns (uint256[] unitPrices)
```

### getBestBorrowUnitPrices

```solidity
function getBestBorrowUnitPrices(bytes32 ccy) external view returns (uint256[] unitPrices)
```

### getMidUnitPrices

```solidity
function getMidUnitPrices(bytes32 ccy) external view returns (uint256[] unitPrices)
```

### getOrderEstimation

```solidity
function getOrderEstimation(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice, uint256 additionalDepositAmount, bool ignoreBorrowedAmount) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 coverage, bool isInsufficientDepositAmount)
```

### getBorrowOrderBook

```solidity
function getBorrowOrderBook(bytes32 ccy, uint256 maturity, uint256 limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
```

### getLendOrderBook

```solidity
function getLendOrderBook(bytes32 ccy, uint256 maturity, uint256 limit) external view returns (uint256[] unitPrices, uint256[] amounts, uint256[] quantities)
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
function getGenesisValue(bytes32 ccy, address user) external view returns (int256 genesisValue)
```

### getOrders

```solidity
function getOrders(bytes32[] ccys, address user) external view returns (struct ILendingMarketController.Order[] activeOrders, struct ILendingMarketController.Order[] inactiveOrders)
```

### getPosition

```solidity
function getPosition(bytes32 _ccy, uint256 _maturity, address _user) external view returns (int256 presentValue, int256 futureValue)
```

### getPositions

```solidity
function getPositions(bytes32[] ccys, address user) external view returns (struct ILendingMarketController.Position[] positions)
```

### calculateFunds

```solidity
function calculateFunds(bytes32 ccy, address user, uint256 liquidationThresholdRate) external view returns (uint256 workingLendOrdersAmount, uint256 claimableAmount, uint256 collateralAmount, uint256 lentAmount, uint256 workingBorrowOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### calculateTotalFundsInBaseCurrency

```solidity
function calculateTotalFundsInBaseCurrency(address user, struct ILendingMarketController.AdditionalFunds _additionalFunds, uint256 liquidationThresholdRate) external view returns (uint256 plusDepositAmountInAdditionalFundsCcy, uint256 minusDepositAmountInAdditionalFundsCcy, uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount)
```

### isInitializedLendingMarket

```solidity
function isInitializedLendingMarket(bytes32 ccy) external view returns (bool)
```

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 ccy, uint256 genesisDate, uint256 compoundFactor, uint256 orderFeeRate, uint256 circuitBreakerLimitRange) external
```

### createOrderBook

```solidity
function createOrderBook(bytes32 ccy, uint256 marketOpeningDate) external
```

### executeOrder

```solidity
function executeOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external returns (bool)
```

### depositAndExecuteOrder

```solidity
function depositAndExecuteOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external payable returns (bool)
```

### executePreOrder

```solidity
function executePreOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external returns (bool)
```

### depositAndExecutesPreOrder

```solidity
function depositAndExecutesPreOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external payable returns (bool)
```

### unwindPosition

```solidity
function unwindPosition(bytes32 ccy, uint256 maturity) external returns (bool)
```

### executeItayoseCalls

```solidity
function executeItayoseCalls(bytes32[] currencies, uint256 maturity) external returns (bool)
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

### pauseLendingMarkets

```solidity
function pauseLendingMarkets(bytes32 ccy) external returns (bool)
```

### unpauseLendingMarkets

```solidity
function unpauseLendingMarkets(bytes32 ccy) external returns (bool)
```

### cleanUpAllFunds

```solidity
function cleanUpAllFunds(address user) external returns (bool)
```

### cleanUpFunds

```solidity
function cleanUpFunds(bytes32 ccy, address user) external returns (uint256 activeOrderCount)
```

