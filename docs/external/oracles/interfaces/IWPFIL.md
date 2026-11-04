# Solidity API

## IWPFIL

### getPFILByWPFIL

```solidity
function getPFILByWPFIL(uint256 _wpFILAmount) external view returns (uint256)
```

Gets the amount of pFIL represented by an amount of wpFIL.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _wpFILAmount | uint256 | The amount of wpFIL |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The corresponding amount of pFIL |

### unwrap

```solidity
function unwrap(uint256 _wpFILAmount) external returns (uint256 pFILAmount)
```

Unwraps wpFIL into pFIL and sends it to the caller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _wpFILAmount | uint256 | The amount of wpFIL to unwrap |

| Name | Type | Description |
| ---- | ---- | ----------- |
| pFILAmount | uint256 | The amount of pFIL sent to the caller |

