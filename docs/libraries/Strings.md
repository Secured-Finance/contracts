# Solidity API

## Strings

### isEqual

```solidity
function isEqual(string text0, string text1) internal pure returns (bool)
```

_Helper function to check wether strings are equal_

| Name | Type | Description |
| ---- | ---- | ----------- |
| text0 | string | First string to compare |
| text1 | string | Second string to compare |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | Boolean statement |

### toHex

```solidity
function toHex(bytes32 data) public pure returns (string)
```

### toHex16

```solidity
function toHex16(bytes16 data) internal pure returns (bytes32 result)
```

