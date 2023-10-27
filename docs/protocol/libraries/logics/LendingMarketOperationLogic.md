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

### InvalidPreOpeningDate

```solidity
error InvalidPreOpeningDate()
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

### MinDebtUnitPriceUpdated

```solidity
event MinDebtUnitPriceUpdated(bytes32 ccy, uint256 minDebtUnitPrice)
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

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor, uint256 _orderFeeRate, uint256 _circuitBreakerLimitRange, uint256 _minDebtUnitPrice) external
```

### updateMinDebtUnitPrice

```solidity
function updateMinDebtUnitPrice(bytes32 _ccy, uint256 _minDebtUnitPrice) public
```

### createOrderBook

```solidity
function createOrderBook(bytes32 _ccy, uint256 _openingDate, uint256 _preOpeningDate) external
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

### pauseLendingMarket

```solidity
function pauseLendingMarket(bytes32 _ccy) public
```

### unpauseLendingMarket

```solidity
function unpauseLendingMarket(bytes32 _ccy) public
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

