# Solidity API

## ICurrencyController

_Currency Controller contract is responsible for managing supported
currencies in Secured Finance Protocol

Contract links new currencies to ETH Chainlink price feeds, without existing price feed
contract owner is not able to add a new currency into the protocol_

### InvalidCurrency

```solidity
error InvalidCurrency()
```

### InvalidHaircut

```solidity
error InvalidHaircut()
```

### InvalidPriceFeed

```solidity
error InvalidPriceFeed()
```

### InvalidDecimals

```solidity
error InvalidDecimals()
```

### NoPriceFeedExists

```solidity
error NoPriceFeedExists()
```

### StalePriceFeed

```solidity
error StalePriceFeed(address priceFeed, uint256 heartbeat, uint256 updatedAt, uint256 blockTimestamp)
```

### CurrencyAdded

```solidity
event CurrencyAdded(bytes32 ccy, uint256 haircut)
```

### CurrencyRemoved

```solidity
event CurrencyRemoved(bytes32 ccy)
```

### HaircutUpdated

```solidity
event HaircutUpdated(bytes32 ccy, uint256 haircut)
```

### PriceFeedUpdated

```solidity
event PriceFeedUpdated(bytes32 ccy, uint256 decimals, address[] priceFeeds)
```

### convert

```solidity
function convert(bytes32 _fromCcy, bytes32 _toCcy, uint256 _amount) external view returns (uint256 amount)
```

### convert

```solidity
function convert(bytes32 _fromCcy, bytes32 _toCcy, uint256[] _amounts) external view returns (uint256[] amounts)
```

### convertToBaseCurrency

```solidity
function convertToBaseCurrency(bytes32 _ccy, uint256 _amount) external view returns (uint256 amount)
```

### convertToBaseCurrency

```solidity
function convertToBaseCurrency(bytes32 _ccy, int256 _amount) external view returns (int256 amount)
```

### convertToBaseCurrency

```solidity
function convertToBaseCurrency(bytes32 _ccy, uint256[] _amounts) external view returns (uint256[] amounts)
```

### convertFromBaseCurrency

```solidity
function convertFromBaseCurrency(bytes32 _ccy, uint256 _amountETH) external view returns (uint256 amount)
```

### convertFromBaseCurrency

```solidity
function convertFromBaseCurrency(bytes32 _ccy, uint256[] _amounts) external view returns (uint256[] amounts)
```

### getDecimals

```solidity
function getDecimals(bytes32) external view returns (uint8)
```

### getCurrencies

```solidity
function getCurrencies() external view returns (bytes32[])
```

### getHaircut

```solidity
function getHaircut(bytes32 _ccy) external view returns (uint256)
```

### getPriceFeed

```solidity
function getPriceFeed(bytes32 _ccy) external view returns (struct PriceFeed)
```

### getLastPrice

```solidity
function getLastPrice(bytes32 _ccy) external view returns (int256 price)
```

### getAggregatedLastPrice

```solidity
function getAggregatedLastPrice(bytes32 _ccy) external view returns (int256)
```

### currencyExists

```solidity
function currencyExists(bytes32 _ccy) external view returns (bool)
```

### updatePriceFeed

```solidity
function updatePriceFeed(bytes32 _ccy, uint8 _decimals, address[] _priceFeeds, uint256 _heartbeat) external
```

### addCurrency

```solidity
function addCurrency(bytes32 _ccy, uint8 _decimals, uint256 _haircut, address[] _priceFeeds, uint256 _heartbeat) external
```

### updateHaircut

```solidity
function updateHaircut(bytes32 _ccy, uint256 _haircut) external
```

### removeCurrency

```solidity
function removeCurrency(bytes32 _ccy) external
```

