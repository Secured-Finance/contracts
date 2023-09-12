# Solidity API

## LendingMarketOperationLogic

### OBSERVATION_PERIOD

```solidity
uint256 OBSERVATION_PERIOD
```

### InvalidCompoundFactor

```solidity
error InvalidCompoundFactor()
```

### InvalidCurrency

```solidity
error InvalidCurrency()
```

### InvalidOpeningDate

```solidity
error InvalidOpeningDate()
```

### InvalidTimestamp

```solidity
error InvalidTimestamp()
```

### LendingMarketNotInitialized

```solidity
error LendingMarketNotInitialized()
```

### NotEnoughOrderBooks

```solidity
error NotEnoughOrderBooks()
```

### LendingMarketInitialized

```solidity
event LendingMarketInitialized(bytes32 ccy, uint256 genesisDate, uint256 compoundFactor, uint256 orderFeeRate, uint256 circuitBreakerLimitRange, address lendingMarket, address futureValueVault)
```

### OrderBookCreated

```solidity
event OrderBookCreated(bytes32 ccy, uint8 orderBookId, uint256 openingDate, uint256 maturity)
```

### OrderBooksRotated

```solidity
event OrderBooksRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity)
```

### EmergencyTerminationExecuted

```solidity
event EmergencyTerminationExecuted(uint256 timestamp)
```

### getOrderBookDetails

```solidity
function getOrderBookDetails(bytes32[] _ccys) external view returns (struct ILendingMarketController.OrderBookDetail[] orderBookDetails)
```

### getOrderBookDetailsPerCurrency

```solidity
function getOrderBookDetailsPerCurrency(bytes32 _ccy) public view returns (struct ILendingMarketController.OrderBookDetail[] orderBookDetail)
```

### getOrderBookDetail

```solidity
function getOrderBookDetail(bytes32 _ccy, uint256 _maturity) public view returns (uint256 bestLendUnitPrice, uint256 bestBorrowUnitPrice, uint256 marketUnitPrice, uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice, uint256 openingUnitPrice, uint256 openingDate, bool isReady)
```

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor, uint256 _orderFeeRate, uint256 _circuitBreakerLimitRange) external
```

### createOrderBook

```solidity
function createOrderBook(bytes32 _ccy, uint256 _openingDate) external
```

### executeItayoseCall

```solidity
function executeItayoseCall(bytes32 _ccy, uint256 _maturity) external returns (struct PartiallyFilledOrder partiallyFilledLendingOrder, struct PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

### rotateOrderBooks

```solidity
function rotateOrderBooks(bytes32 _ccy) external returns (uint256 newMaturity)
```

### executeEmergencyTermination

```solidity
function executeEmergencyTermination() external
```

### pauseLendingMarkets

```solidity
function pauseLendingMarkets(bytes32 _ccy) public
```

### unpauseLendingMarkets

```solidity
function unpauseLendingMarkets(bytes32 _ccy) public
```

### updateOrderLogs

```solidity
function updateOrderLogs(bytes32 _ccy, uint256 _maturity, uint256 _filledUnitPrice, uint256 _filledAmount, uint256 _filledFutureValue) external
```

### calculateNextMaturity

```solidity
function calculateNextMaturity(uint256 _timestamp, uint256 _period) public pure returns (uint256)
```

### _getLastFridayAfterMonths

```solidity
function _getLastFridayAfterMonths(uint256 _timestamp, uint256 _months) internal pure returns (uint256 lastFridayTimestamp)
```

### _calculateAutoRollUnitPrice

```solidity
function _calculateAutoRollUnitPrice(bytes32 _ccy, uint256 _maturity) internal view returns (uint256 autoRollUnitPrice)
```

### _convertUnitPrice

```solidity
function _convertUnitPrice(uint256 _unitPrice, uint256 _maturity, uint256 _currentTimestamp, uint256 _destinationTimestamp) internal pure returns (uint256)
```

