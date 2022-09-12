# Solidity API

## ProtocolTypes

_ProtocolTypes is a base-level contract that holds common Secured Finance protocol types_

### BP

```solidity
uint256 BP
```

### PCT

```solidity
uint256 PCT
```

### DAYS_IN_YEAR

```solidity
uint256 DAYS_IN_YEAR
```

### SECONDS_IN_YEAR

```solidity
uint256 SECONDS_IN_YEAR
```

### Side

```solidity
enum Side {
  LEND,
  BORROW
}
```

### Ccy

```solidity
enum Ccy {
  ETH,
  FIL,
  USDC,
  BTC
}
```

### CollateralState

```solidity
enum CollateralState {
  EMPTY,
  AVAILABLE,
  IN_USE,
  MARGIN_CALL,
  LIQUIDATION_IN_PROGRESS,
  LIQUIDATION
}
```

### Currency

```solidity
struct Currency {
  bool isSupported;
  string name;
}
```

