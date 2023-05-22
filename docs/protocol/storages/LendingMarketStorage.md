# Solidity API

## MarketOrder

```solidity
struct MarketOrder {
  enum ProtocolTypes.Side side;
  uint256 unitPrice;
  uint256 maturity;
  uint256 timestamp;
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
  uint48 lastOrderId;
  uint256 openingDate;
  uint256 maturity;
  mapping(uint256 => uint256) openingUnitPrices;
  mapping(uint256 => bool) isReady;
  mapping(address => uint48[]) activeLendOrderIds;
  mapping(address => uint48[]) activeBorrowOrderIds;
  mapping(address => uint256) userCurrentMaturities;
  mapping(uint256 => struct MarketOrder) orders;
  mapping(uint256 => bool) isPreOrder;
  mapping(uint256 => struct OrderStatisticsTreeLib.Tree) lendOrders;
  mapping(uint256 => struct OrderStatisticsTreeLib.Tree) borrowOrders;
  mapping(uint256 => mapping(enum ProtocolTypes.Side => uint256)) circuitBreakerThresholdUnitPrices;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketStorage.Storage r)
```

