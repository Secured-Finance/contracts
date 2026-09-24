# Solidity API

## LendingMarketOperationLogic

### OBSERVATION_PERIOD

```solidity
uint256 OBSERVATION_PERIOD
```

### COMPOUND_FACTOR_DECIMALS

```solidity
uint8 COMPOUND_FACTOR_DECIMALS
```

### ZC_TOKEN_BASE_DECIMALS

```solidity
uint8 ZC_TOKEN_BASE_DECIMALS
```

### PRE_ORDER_BASE_PERIOD

```solidity
uint256 PRE_ORDER_BASE_PERIOD
```

### UNIT_PRICE_RANGE

```solidity
uint256 UNIT_PRICE_RANGE
```

### InvalidCompoundFactor

```solidity
error InvalidCompoundFactor()
```

### InvalidCurrency

```solidity
error InvalidCurrency()
```

### TooManyTokenDecimals

```solidity
error TooManyTokenDecimals(address tokenAddress, uint8 decimals)
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

### InvalidMinDebtUnitPrice

```solidity
error InvalidMinDebtUnitPrice()
```

### InvalidOrderUnitPrice

```solidity
error InvalidOrderUnitPrice(uint256 unitPrice, uint256 minUnitPrice, uint256 maxUnitPrice)
```

### IncompleteItayoseProcess

```solidity
error IncompleteItayoseProcess(bytes32 ccy, uint256 maturity, struct ItayoseProcessStatus status)
```

### LendingMarketNotInitialized

```solidity
error LendingMarketNotInitialized()
```

### NotEnoughOrderBooks

```solidity
error NotEnoughOrderBooks()
```

### AlreadyZCTokenExists

```solidity
error AlreadyZCTokenExists(address tokenAddress)
```

### InvalidMaturity

```solidity
error InvalidMaturity(uint256 maturity)
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
event OrderBookCreated(bytes32 ccy, uint8 orderBookId, uint256 openingDate, uint256 preOpeningDate, uint256 maturity)
```

### OrderBooksRotated

```solidity
event OrderBooksRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity)
```

### EmergencyTerminationExecuted

```solidity
event EmergencyTerminationExecuted(uint256 timestamp)
```

### ItayoseProcessInitialized

```solidity
event ItayoseProcessInitialized(bytes32 ccy, uint256 maturity, uint256 openingUnitPrice, uint256 lastLendUnitPrice, uint256 lastBorrowUnitPrice, uint256 totalOffsetAmount)
```

### ItayoseSettlementProgress

```solidity
event ItayoseSettlementProgress(bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side makerSide, uint256 batchFilledAmount, uint256 remainingLendOffsetAmount, uint256 remainingBorrowOffsetAmount)
```

### ItayoseProcessFinalized

```solidity
event ItayoseProcessFinalized(bytes32 ccy, uint256 maturity)
```

### ZCTokenCreated

```solidity
event ZCTokenCreated(bytes32 ccy, uint256 maturity, string name, string symbol, uint8 decimals, address tokenAddress)
```

### initializeLendingMarket

```solidity
function initializeLendingMarket(bytes32 _ccy, uint256 _genesisDate, uint256 _compoundFactor, uint256 _orderFeeRate, uint256 _circuitBreakerLimitRange, uint256 _minDebtUnitPrice) external
```

### updateMinDebtUnitPrice

```solidity
function updateMinDebtUnitPrice(bytes32 _ccy, uint256 _minDebtUnitPrice) public
```

### getOrderUnitPriceRange

```solidity
function getOrderUnitPriceRange(bytes32 _ccy, uint256 _maturity) public view returns (uint256 minLendUnitPrice, uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice, uint256 maxBorrowUnitPrice, uint256 referenceUnitPrice, bool isMinDebtUnitPriceReference)
```

### _getBaseOrderUnitPriceRange

```solidity
function _getBaseOrderUnitPriceRange(bytes32 _ccy, uint256 _maturity) private view returns (uint256 minUnitPrice, uint256 maxUnitPrice, uint256 referenceUnitPrice, bool isPreOrderPeriod, bool isMinDebtUnitPriceReference)
```

### getItayoseProcessStatus

```solidity
function getItayoseProcessStatus(bytes32 _ccy, uint256 _maturity) public view returns (struct ItayoseProcessStatus)
```

### validateOrderUnitPrice

```solidity
function validateOrderUnitPrice(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _unitPrice) external view
```

### _getPreviousOpeningUnitPrice

```solidity
function _getPreviousOpeningUnitPrice(bytes32 _ccy, uint256 _maturity, uint256 _openingDate, uint8 _orderBookId, contract ILendingMarket _market) private view returns (bool hasPreviousOpening, uint256 convertedUnitPrice)
```

### _getMinDebtUnitPriceRange

```solidity
function _getMinDebtUnitPriceRange(bytes32 _ccy, uint256 _maturity, uint256 _openingDate) private view returns (uint256 minUnitPrice, uint256 maxUnitPrice, uint256 referenceUnitPrice)
```

### createOrderBook

```solidity
function createOrderBook(bytes32 _ccy, uint256 _openingDate, uint256 _preOpeningDate) public
```

### executeItayoseCall

```solidity
function executeItayoseCall(bytes32 _ccy, uint256 _maturity) external
```

### executeItayoseStep

```solidity
function executeItayoseStep(bytes32 _ccy, uint256 _maturity) public returns (bool completed)
```

### _initializeItayose

```solidity
function _initializeItayose(bytes32 _ccy, uint256 _maturity, contract ILendingMarket _market, uint8 _orderBookId) private returns (struct ItayoseProcessStatus status)
```

### _executeItayoseSettlement

```solidity
function _executeItayoseSettlement(bytes32 _ccy, uint256 _maturity, contract ILendingMarket _market, uint8 _orderBookId) private returns (struct ItayoseSettlementResult result)
```

### _finalizeItayose

```solidity
function _finalizeItayose(bytes32 _ccy, uint256 _maturity, contract ILendingMarket _market, uint8 _orderBookId) private
```

### rotateOrderBooks

```solidity
function rotateOrderBooks(bytes32 _ccy) external
```

### executeEmergencyTermination

```solidity
function executeEmergencyTermination() external
```

### _requireItayoseComplete

```solidity
function _requireItayoseComplete(bytes32 _ccy, contract ILendingMarket _market, uint8 _orderBookId) private view
```

### _requireNoItayoseInProgress

```solidity
function _requireNoItayoseInProgress(bytes32 _ccy, contract ILendingMarket _market, uint8 _orderBookId) private view
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
function updateOrderLogs(bytes32 _ccy, uint256 _maturity, uint256 _filledAmount, uint256 _filledFutureValue) external
```

### createZCToken

```solidity
function createZCToken(bytes32 _ccy, uint256 _maturity, address _tokenAddress) public
```

### calculateNextMaturity

```solidity
function calculateNextMaturity(uint256 _timestamp, uint256 _period) public pure returns (uint256)
```

### bytes32ToString

```solidity
function bytes32ToString(bytes32 _bytes32) public pure returns (string)
```

### _getLastFridayAfterMonths

```solidity
function _getLastFridayAfterMonths(uint256 _timestamp, uint256 _months) internal pure returns (uint256 lastFridayTimestamp)
```

### _getShortMonthYearString

```solidity
function _getShortMonthYearString(uint256 timestamp) internal pure returns (string)
```

### _calculateAutoRollUnitPrice

```solidity
function _calculateAutoRollUnitPrice(bytes32 _ccy, uint256 _nearestMaturity, uint256 _destinationMaturity, uint8 _destinationOrderBookId, contract ILendingMarket _market) internal view returns (uint256 autoRollUnitPrice)
```

### _convertUnitPrice

```solidity
function _convertUnitPrice(uint256 _unitPrice, uint256 _maturity, uint256 _currentTimestamp, uint256 _destinationTimestamp) internal pure returns (uint256)
```

