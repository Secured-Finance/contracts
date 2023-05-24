# Solidity API

## LendingMarketOperationLogic

### initializeCurrencySetting

```solidity
function initializeCurrencySetting(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor) external
```

### createLendingMarket

```solidity
function createLendingMarket(bytes32 _ccy, uint256 _openingDate) external returns (address market, address futureValueVault, uint256 maturity)
```

### executeItayoseCall

```solidity
function executeItayoseCall(bytes32 _ccy, uint256 _maturity) external returns (struct ILendingMarket.PartiallyFilledOrder partiallyFilledLendingOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledBorrowingOrder)
```

### rotateLendingMarkets

```solidity
function rotateLendingMarkets(bytes32 _ccy, uint256 _autoRollFeeRate) external returns (uint256 fromMaturity, uint256 toMaturity)
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
function updateOrderLogs(bytes32 _ccy, uint256 _maturity, uint256 _observationPeriod, uint256 _filledUnitPrice, uint256 _filledAmount, uint256 _filledFutureValue) external
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

