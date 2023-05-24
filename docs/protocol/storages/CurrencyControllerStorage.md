# Solidity API

## Currency

```solidity
struct Currency {
  bool isSupported;
  string name;
}
```

## CurrencyControllerStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  bytes32 baseCurrency;
  struct EnumerableSet.Bytes32Set currencies;
  mapping(bytes32 => uint256) haircuts;
  mapping(bytes32 => contract AggregatorV3Interface[]) priceFeeds;
  mapping(bytes32 => uint8) decimalsCaches;
}
```

### slot

```solidity
function slot() internal pure returns (struct CurrencyControllerStorage.Storage r)
```

