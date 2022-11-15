# Solidity API

## LendingMarketControllerStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  mapping(bytes32 => address[]) lendingMarkets;
  mapping(bytes32 => mapping(address => address)) futureValueVaults;
  mapping(bytes32 => mapping(uint256 => address)) maturityLendingMarkets;
  mapping(bytes32 => uint256) basisDates;
  mapping(address => struct EnumerableSet.Bytes32Set) usedCurrencies;
  mapping(address => struct EnumerableSet.Bytes32Set) exposedCurrencies;
  mapping(address => mapping(bytes32 => mapping(uint256 => bool))) activeOrderExistences;
}
```

### slot

```solidity
function slot() internal pure returns (struct LendingMarketControllerStorage.Storage r)
```

