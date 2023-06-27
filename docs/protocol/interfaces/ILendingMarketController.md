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

### getLendingMarkets

```solidity
function getLendingMarkets(bytes32 ccy) external view returns (address[])
```

### getLendingMarket

```solidity
function getLendingMarket(bytes32 ccy, uint256 maturity) external view returns (address)
```

### getFutureValueVault

```solidity
function getFutureValueVault(bytes32 ccy, uint256 maturity) external view returns (address)
```

### getBorrowUnitPrices

```solidity
function getBorrowUnitPrices(bytes32 ccy) external view returns (uint256[] unitPrices)
```

### getLendUnitPrices

```solidity
function getLendUnitPrices(bytes32 ccy) external view returns (uint256[] unitPrices)
```

### getMidUnitPrices

```solidity
function getMidUnitPrices(bytes32 ccy) external view returns (uint256[] unitPrices)
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
function calculateFunds(bytes32 ccy, address user) external view returns (uint256 workingLendOrdersAmount, uint256 claimableAmount, uint256 collateralAmount, uint256 lentAmount, uint256 workingBorrowOrdersAmount, uint256 debtAmount, uint256 borrowedAmount)
```

### calculateTotalFundsInBaseCurrency

```solidity
function calculateTotalFundsInBaseCurrency(address user, bytes32 depositCcy, uint256 depositAmount) external view returns (uint256 totalWorkingLendOrdersAmount, uint256 totalClaimableAmount, uint256 totalCollateralAmount, uint256 totalLentAmount, uint256 totalWorkingBorrowOrdersAmount, uint256 totalDebtAmount, uint256 totalBorrowedAmount, bool isEnoughDeposit)
```

### isInitializedLendingMarket

```solidity
function isInitializedLendingMarket(bytes32 ccy) external view returns (bool)
```

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 ccy, uint256 genesisDate, uint256 compoundFactor, uint256 orderFeeRate, uint256 autoRollFeeRate, uint256 circuitBreakerLimitRange) external
```

### createLendingMarket

```solidity
function createLendingMarket(bytes32 ccy, uint256 marketOpeningDate) external
```

### createOrder

```solidity
function createOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external returns (bool)
```

### depositAndCreateOrder

```solidity
function depositAndCreateOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external payable returns (bool)
```

### createPreOrder

```solidity
function createPreOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external returns (bool)
```

### depositAndCreatePreOrder

```solidity
function depositAndCreatePreOrder(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) external payable returns (bool)
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
function executeRedemption() external returns (bool)
```

### executeLiquidationCall

```solidity
function executeLiquidationCall(bytes32 collateralCcy, bytes32 debtCcy, uint256 debtMaturity, address user) external returns (bool)
```

### cancelOrder

```solidity
function cancelOrder(bytes32 ccy, uint256 maturity, uint48 orderId) external returns (bool)
```

### rotateLendingMarkets

```solidity
function rotateLendingMarkets(bytes32 ccy) external
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

