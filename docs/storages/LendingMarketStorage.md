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
  uint48 lastOrderId;
  bytes32 ccy;
  uint256 basisDate;
  uint256 maturity;
  mapping(address => uint48[]) activeLendOrderIds;
  mapping(address => uint48[]) activeBorrowOrderIds;
  mapping(address => uint256) userCurrentMaturities;
  mapping(uint256 => struct MarketOrder) orders;
  mapping(uint256 => struct HitchensOrderStatisticsTreeLib.Tree) lendOrders;
  mapping(uint256 => struct HitchensOrderStatisticsTreeLib.Tree) borrowOrders;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketStorage.Storage r)
```

