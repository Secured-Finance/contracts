# Solidity API

## ItayoseLog

```solidity
struct ItayoseLog {
  uint256 openingUnitPrice;
  uint256 lastLendUnitPrice;
  uint256 lastBorrowUnitPrice;
}
```

## LendingMarketStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  bytes32 ccy;
  uint8 lastOrderBookId;
  mapping(uint8 => struct OrderBookLib.OrderBook) orderBooks;
  mapping(uint256 => bool) isReady;
  mapping(uint256 => struct ItayoseLog) itayoseLogs;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketStorage.Storage r)
```

