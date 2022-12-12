# Solidity API

## CurrencyController

Implements managing of the supported currencies in the protocol.

This contract links new currencies to ETH Chainlink price feeds, without an existing price feed
contract owner is not able to add a new currency into the protocol

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
function initialize(address _owner) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |

### addCurrency

```solidity
function addCurrency(bytes32 _ccy, address _ethPriceFeed, uint256 _haircut) public
```

Adds new currency into the protocol and links with existing ETH price feed of Chainlink.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _ethPriceFeed | address | Address for ETH price feed |
| _haircut | uint256 | Remaining ratio after haircut |

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

### getEthDecimals

```solidity
function getEthDecimals(bytes32 _ccy) external view returns (uint8)
```

Get ETH decimal for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### getUsdDecimals

```solidity
function getUsdDecimals(bytes32 _ccy) external view returns (uint8)
```

Gets USD decimal for the selected currency.

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

### linkPriceFeed

```solidity
function linkPriceFeed(bytes32 _ccy, address _priceFeedAddr, bool _isEthPriceFeed) public returns (bool)
```

Links the contract to existing Chainlink price feed.

_This method can use only Chainlink._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _priceFeedAddr | address | The contract address of Chainlink price feed |
| _isEthPriceFeed | bool | Boolean if the price feed is in ETH or not |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the execution of the operation succeeds |

### removePriceFeed

```solidity
function removePriceFeed(bytes32 _ccy, bool _isEthPriceFeed) external
```

Removes existing Chainlink price feed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _isEthPriceFeed | bool | Boolean if the price feed is in ETH or not |

### getLastUSDPrice

```solidity
function getLastUSDPrice(bytes32 _ccy) public view returns (int256)
```

Gets the last price in USD for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The last price in USD |

### getHistoricalUSDPrice

```solidity
function getHistoricalUSDPrice(bytes32 _ccy, uint80 _roundId) public view returns (int256)
```

Gets the historical price in USD for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _roundId | uint80 | RoundId |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The historical price in USD |

### getLastETHPrice

```solidity
function getLastETHPrice(bytes32 _ccy) public view returns (int256)
```

Gets the last price in ETH for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The last price in ETH |

### getHistoricalETHPrice

```solidity
function getHistoricalETHPrice(bytes32 _ccy, uint80 _roundId) public view returns (int256)
```

Gets the historical price in ETH for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _roundId | uint80 | RoundId |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The historical price in ETH |

### convertToETH

```solidity
function convertToETH(bytes32 _ccy, uint256 _amount) external view returns (uint256 amount)
```

Gets the converted amount of currency in ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted to ETH |
| _amount | uint256 | Amount to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The converted amount |

### convertToETH

```solidity
function convertToETH(bytes32 _ccy, int256 _amount) external view returns (int256 amount)
```

Gets the converted amount of currency in ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted to ETH |
| _amount | int256 | Amount to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | int256 | The converted amount |

### convertToETH

```solidity
function convertToETH(bytes32 _ccy, uint256[] _amounts) external view returns (uint256[] amounts)
```

Gets the converted amount of currency in ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted to ETH |
| _amounts | uint256[] | Amounts to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amounts | uint256[] | The converted amounts |

### convertFromETH

```solidity
function convertFromETH(bytes32 _ccy, uint256 _amountETH) public view returns (uint256 amount)
```

Gets the converted amount to the selected currency from ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency that has to be converted from ETH |
| _amountETH | uint256 | Amount in ETH to be converted |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The converted amount |

### _isETH

```solidity
function _isETH(bytes32 _ccy) internal pure returns (bool)
```

