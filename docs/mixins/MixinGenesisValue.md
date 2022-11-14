# Solidity API

## MixinGenesisValue

### Transfer

```solidity
event Transfer(bytes32 ccy, address from, address to, int256 value)
```

### CompoundFactorUpdated

```solidity
event CompoundFactorUpdated(bytes32 ccy, uint256 compoundFactor, uint256 unitPrice, uint256 currentMaturity, uint256 previousMaturity)
```

### isRegisteredCurrency

```solidity
function isRegisteredCurrency(bytes32 _ccy) public view returns (bool)
```

### decimals

```solidity
function decimals(bytes32 _ccy) public view returns (uint8)
```

### getGenesisValue

```solidity
function getGenesisValue(bytes32 _ccy, address _user) public view returns (int256)
```

### getCompoundFactor

```solidity
function getCompoundFactor(bytes32 _ccy) public view returns (uint256)
```

### getMaturityUnitPrice

```solidity
function getMaturityUnitPrice(bytes32 _ccy, uint256 _maturity) public view returns (struct MaturityUnitPrice)
```

### getGenesisValueInFutureValue

```solidity
function getGenesisValueInFutureValue(bytes32 _ccy, address _user) public view returns (int256)
```

### _calculateGVFromFV

```solidity
function _calculateGVFromFV(bytes32 _ccy, uint256 _basisMaturity, int256 _futureValue) internal view returns (int256)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(uint256 _futureValue, uint256 _unitPrice) internal pure returns (uint256)
```

### _calculatePVFromFV

```solidity
function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice) internal pure returns (int256)
```

### _registerCurrency

```solidity
function _registerCurrency(bytes32 _ccy, uint8 _decimals, uint256 _compoundFactor) internal
```

### _updateCompoundFactor

```solidity
function _updateCompoundFactor(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice) internal
```

### _addGenesisValue

```solidity
function _addGenesisValue(bytes32 _ccy, address _user, uint256 _basisMaturity, int256 _futureValue) internal returns (bool)
```

