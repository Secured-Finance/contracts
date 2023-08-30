# Solidity API

## PriceFeed

```solidity
struct PriceFeed {
  contract AggregatorV3Interface[] instances;
  uint256 heartbeat;
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
  struct EnumerableSet.Bytes32Set currencies;
  mapping(bytes32 => uint256) haircuts;
  mapping(bytes32 => uint8) decimalsCaches;
  mapping(bytes32 => struct PriceFeed) priceFeeds;
}
```

### slot

```solidity
function slot() internal pure returns (struct CurrencyControllerStorage.Storage r)
```

