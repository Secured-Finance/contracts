# Solidity API

## EIP712UpgradeableStorage

### STORAGE_SLOT

```solidity
bytes32 STORAGE_SLOT
```

### Storage

```solidity
struct Storage {
  bytes32 cachedDomainSeparator;
  uint256 cachedChainId;
  address cachedThis;
  bytes32 hashedName;
  bytes32 hashedVersion;
  ShortString name;
  ShortString version;
  string nameFallback;
  string versionFallback;
}
```

### slot

```solidity
function slot() internal pure returns (struct EIP712UpgradeableStorage.Storage r)
```

