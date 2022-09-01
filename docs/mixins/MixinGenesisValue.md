# Solidity API

## MixinGenesisValue

### Transfer

```solidity
event Transfer(bytes32 ccy, address from, address to, int256 value)
```

### CompoundFactorUpdated

```solidity
event CompoundFactorUpdated(bytes32 ccy, uint256 maturity, uint256 rate, uint256 tenor)
```

### isRegisteredCurrency

```solidity
function isRegisteredCurrency(bytes32 _ccy) public view returns (bool)
```

### decimals

```solidity
function decimals(bytes32 _ccy) public view returns (uint8)
```

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(bytes32 _ccy) public view returns (uint256)
```

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(bytes32 _ccy) public view returns (uint256)
```

### getGenesisValue

```solidity
function getGenesisValue(bytes32 _ccy, address _account) public view returns (int256)
```

### getCompoundFactor

```solidity
function getCompoundFactor(bytes32 _ccy) public view returns (uint256)
```

### getCompoundFactorInMaturity

```solidity
function getCompoundFactorInMaturity(bytes32 _ccy, uint256 _maturity) public view returns (uint256)
```

### getMaturityRate

```solidity
function getMaturityRate(bytes32 _ccy, uint256 _maturity) public view returns (struct MaturityRate)
```

### futureValueOf

```solidity
function futureValueOf(bytes32 _ccy, uint256 _maturity, int256 _futureValueInMaturity) public view returns (int256)
```

### _registerCurrency

```solidity
function _registerCurrency(bytes32 _ccy, uint8 _decimals, uint256 _compoundFactor) internal
```

### _updateCompoundFactor

```solidity
function _updateCompoundFactor(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _rate) internal
```

### _addGenesisValue

```solidity
function _addGenesisValue(bytes32 _ccy, address _account, uint256 _basisMaturity, int256 _futureValue) internal returns (bool)
```

