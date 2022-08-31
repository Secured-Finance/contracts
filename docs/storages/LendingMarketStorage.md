# Solidity API

## MarketOrder

```solidity
struct MarketOrder {
  enum ProtocolTypes.Side side;
  uint256 amount;
  uint256 rate;
  address maker;
  uint256 maturity;
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
  uint256 lastOrderId;
  bytes32 ccy;
  uint256 basisDate;
  uint256 maturity;
  mapping(uint256 => struct MarketOrder) orders;
  mapping(uint256 => struct HitchensOrderStatisticsTreeLib.Tree) lendOrders;
  mapping(uint256 => struct HitchensOrderStatisticsTreeLib.Tree) borrowOrders;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketStorage.Storage r)
```

