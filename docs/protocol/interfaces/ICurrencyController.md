# Solidity API

## ICurrencyController

_Currency Controller contract is responsible for managing supported
currencies in Secured Finance Protocol

Contract links new currencies to ETH Chainlink price feeds, without existing price feed
contract owner is not able to add a new currency into the protocol_

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

### PriceFeedAdded

```solidity
event PriceFeedAdded(bytes32 ccy, string secondCcy, address priceFeed)
```

### PriceFeedRemoved

```solidity
event PriceFeedRemoved(bytes32 ccy, string secondCcy, address priceFeed)
```

### convert

```solidity
function convert(bytes32 _fromCcy, bytes32 _toCcy, uint256 _amount) external view returns (uint256 amount)
```

### convertFromETH

```solidity
function convertFromETH(bytes32 _ccy, uint256 _amountETH) external view returns (uint256 amount)
```

### convertToETH

```solidity
function convertToETH(bytes32 _ccy, uint256 _amount) external view returns (uint256 amount)
```

### convertToETH

```solidity
function convertToETH(bytes32 _ccy, int256 _amount) external view returns (int256 amount)
```

### convertToETH

```solidity
function convertToETH(bytes32 _ccy, uint256[] _amounts) external view returns (uint256[] amounts)
```

### getEthDecimals

```solidity
function getEthDecimals(bytes32) external view returns (uint8)
```

### getUsdDecimals

```solidity
function getUsdDecimals(bytes32) external view returns (uint8)
```

### getCurrencies

```solidity
function getCurrencies() external view returns (bytes32[])
```

### getHaircut

```solidity
function getHaircut(bytes32 _ccy) external view returns (uint256)
```

### getHistoricalETHPrice

```solidity
function getHistoricalETHPrice(bytes32 _ccy, uint80 _roundId) external view returns (int256)
```

### getHistoricalUSDPrice

```solidity
function getHistoricalUSDPrice(bytes32 _ccy, uint80 _roundId) external view returns (int256)
```

### getLastETHPrice

```solidity
function getLastETHPrice(bytes32 _ccy) external view returns (int256)
```

### getLastUSDPrice

```solidity
function getLastUSDPrice(bytes32 _ccy) external view returns (int256)
```

### currencyExists

```solidity
function currencyExists(bytes32 _ccy) external view returns (bool)
```

### linkPriceFeed

```solidity
function linkPriceFeed(bytes32 _ccy, address _priceFeedAddr, bool _isEthPriceFeed) external returns (bool)
```

### removePriceFeed

```solidity
function removePriceFeed(bytes32 _ccy, bool _isEthPriceFeed) external
```

### addCurrency

```solidity
function addCurrency(bytes32 _ccy, address _ethPriceFeed, uint256 _haircut) external
```

### updateHaircut

```solidity
function updateHaircut(bytes32 _ccy, uint256 _haircut) external
```

### removeCurrency

```solidity
function removeCurrency(bytes32 _ccy) external
```

