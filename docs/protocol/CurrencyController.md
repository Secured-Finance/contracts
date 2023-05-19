# Solidity API

## CurrencyController

Implements managing of the supported currencies in the protocol.

This contract links new currencies to Chainlink price feeds. To add a new currency to the protocol except for the base currency,
the owner needs to also add an existing price feed contract.

### onlySupportedCurrency

```solidity
modifier onlySupportedCurrency(bytes32 _ccy)
```

Modifier to check if the currency is supported.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### initialize

```solidity
function initialize(address _owner, bytes32 _baseCcy) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _baseCcy | bytes32 | The base currency name in bytes32 |

### getDecimals

```solidity
function getDecimals(bytes32 _ccy) external view returns (uint8)
```

Gets cached decimal of the price feed for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### getCurrencies

```solidity
function getCurrencies() external view returns (bytes32[])
```

Gets all currencies.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | The array of the currency |

### getHaircut

```solidity
function getHaircut(bytes32 _ccy) external view returns (uint256)
```

Gets haircut ratio for the selected currency.
Haircut is used in bilateral netting cross-calculation.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### currencyExists

```solidity
function currencyExists(bytes32 _ccy) public view returns (bool)
```

Gets if the selected currency is supported.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the selected currency is supported or not |

### addCurrency

```solidity
function addCurrency(bytes32 _ccy, uint8 _decimals, uint256 _haircut, address[] _priceFeeds) public
```

Adds new currency into the protocol and links with existing price feed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32k |
| _decimals | uint8 | Currency decimals |
| _haircut | uint256 | Remaining ratio after haircut |
| _priceFeeds | address[] | Array with the contract address of price feed |

### removeCurrency

```solidity
function removeCurrency(bytes32 _ccy) public
```

Updates the flag indicating if the currency is supported in the protocol.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### updateHaircut

```solidity
function updateHaircut(bytes32 _ccy, uint256 _haircut) public
```

Updates the haircut ratio for supported currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _haircut | uint256 | Remaining ratio after haircut |

### updatePriceFeed

```solidity
function updatePriceFeed(bytes32 _ccy, uint8 _decimals, address[] _priceFeeds) public
```

Update the price feed contract addresses.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _decimals | uint8 | Currency decimals |
| _priceFeeds | address[] | Array with the contract address of price feed |

### removePriceFeed

```solidity
function removePriceFeed(bytes32 _ccy) external
```

Removes existing Chainlink price feed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### getLastPrice

```solidity
function getLastPrice(bytes32 _ccy) public view returns (int256 price)
```

Gets the last price for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | int256 | The last price |

### convert

```solidity
function convert(bytes32 _fromCcy, bytes32 _toCcy, uint256 _amount) external view returns (uint256 amount)
```

Gets the converted amount of currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _fromCcy | bytes32 | Currency to convert from |
| _toCcy | bytes32 | Currency to convert to |
| _amount | uint256 | Amount to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The converted amount |

### convertToBaseCurrency

```solidity
function convertToBaseCurrency(bytes32 _ccy, uint256 _amount) public view returns (uint256 amount)
```

Gets the converted amount in the base currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted to the base currency |
| _amount | uint256 | Amount to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The converted amount |

### convertToBaseCurrency

```solidity
function convertToBaseCurrency(bytes32 _ccy, int256 _amount) external view returns (int256 amount)
```

Gets the converted amount in the base currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted to the base currency. |
| _amount | int256 | Amount to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | int256 | The converted amount |

### convertToBaseCurrency

```solidity
function convertToBaseCurrency(bytes32 _ccy, uint256[] _amounts) external view returns (uint256[] amounts)
```

Gets the converted amounts in the base currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted to the base currency. |
| _amounts | uint256[] | Amounts to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amounts | uint256[] | The converted amounts |

### convertFromBaseCurrency

```solidity
function convertFromBaseCurrency(bytes32 _ccy, uint256 _amount) public view returns (uint256 amount)
```

Gets the converted amount to the selected currency from the base currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted from the base currency. |
| _amount | uint256 | Amount in the base currency to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The converted amount |

### _isBaseCurrency

```solidity
function _isBaseCurrency(bytes32 _ccy) internal view returns (bool)
```

### _getLastPrice

```solidity
function _getLastPrice(bytes32 _ccy) internal view returns (int256 totalPrice)
```

### _updateHaircut

```solidity
function _updateHaircut(bytes32 _ccy, uint256 _haircut) internal
```

### _updatePriceFeed

```solidity
function _updatePriceFeed(bytes32 _ccy, uint8 _decimals, address[] _priceFeeds) internal
```

