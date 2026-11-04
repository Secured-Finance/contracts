# Solidity API

## IInfinityPool

### convertToShares

```solidity
function convertToShares(uint256 assets) external view returns (uint256)
```

Converts an asset amount into the corresponding pool share amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| assets | uint256 | The amount of assets |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The corresponding amount of shares |

### convertToAssets

```solidity
function convertToAssets(uint256 shares) external view returns (uint256)
```

Converts a pool share amount into the corresponding asset amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | The amount of shares |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The corresponding amount of assets |

### redeem

```solidity
function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)
```

Redeems pool shares for their underlying assets.

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | The amount of shares to redeem |
| receiver | address | The address receiving the underlying assets |
| owner | address | The address owning the shares |

| Name | Type | Description |
| ---- | ---- | ----------- |
| assets | uint256 | The amount of assets redeemed |

