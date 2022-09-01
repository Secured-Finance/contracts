# Solidity API

## CurrencyControllerStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => struct ProtocolTypes.Currency) currencies;
  mapping(bytes32 => uint256) haircuts;
  mapping(bytes32 => bool) isCollateral;
  mapping(bytes32 => address) tokenAddresses;
  mapping(bytes32 => contract AggregatorV3Interface) usdPriceFeeds;
  mapping(bytes32 => contract AggregatorV3Interface) ethPriceFeeds;
  mapping(bytes32 => uint8) usdDecimals;
  mapping(bytes32 => uint8) ethDecimals;
}
```

### slot

```solidity
function slot() internal pure returns (struct CurrencyControllerStorage.Storage r)
```

