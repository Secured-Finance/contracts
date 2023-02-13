# Solidity API

## GenesisValueVault

Implements the management of the genesis value as an amount for Lending deals.

### initialize

```solidity
function initialize(address _resolver) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _resolver | address | The address of the Address Resolver contract |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### acceptedContracts

```solidity
function acceptedContracts() public pure returns (bytes32[] contracts)
```

Returns contract names that can call this contract.

_The contact name listed in this method is also needed to be listed `requiredContracts` method._

### isInitialized

```solidity
function isInitialized(bytes32 _ccy) public view returns (bool)
```

### decimals

```solidity
function decimals(bytes32 _ccy) public view returns (uint8)
```

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(bytes32 _ccy) external view returns (uint256)
```

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(bytes32 _ccy) external view returns (uint256)
```

### getGenesisValue

```solidity
function getGenesisValue(bytes32 _ccy, address _user) public view returns (int256)
```

### getMaturityGenesisValue

```solidity
function getMaturityGenesisValue(bytes32 _ccy, uint256 _maturity) external view returns (int256)
```

### getCurrentMaturity

```solidity
function getCurrentMaturity(bytes32 _ccy) public view returns (uint256)
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

### calculateCurrentFVFromFVInMaturity

```solidity
function calculateCurrentFVFromFVInMaturity(bytes32 _ccy, uint256 _basisMaturity, int256 _futureValue) external view returns (int256)
```

### calculateGVFromFV

```solidity
function calculateGVFromFV(bytes32 _ccy, uint256 _basisMaturity, int256 _futureValue) public view returns (int256)
```

### calculateFVFromGV

```solidity
function calculateFVFromGV(bytes32 _ccy, uint256 _basisMaturity, int256 _genesisValue) public view returns (int256)
```

### initialize

```solidity
function initialize(bytes32 _ccy, uint8 _decimals, uint256 _compoundFactor, uint256 _maturity) external
```

### executeAutoRoll

```solidity
function executeAutoRoll(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice, uint256 _totalFVAmount) external
```

### _updateCompoundFactor

```solidity
function _updateCompoundFactor(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice) private
```

### updateGenesisValue

```solidity
function updateGenesisValue(bytes32 _ccy, address _user, uint256 _basisMaturity, int256 _fvAmount) external returns (bool)
```

### addLendGenesisValue

```solidity
function addLendGenesisValue(bytes32 _ccy, address _user, uint256 _maturity, uint256 _absAmount) public returns (bool)
```

### addBorrowGenesisValue

```solidity
function addBorrowGenesisValue(bytes32 _ccy, address _user, uint256 _maturity, uint256 _absAmount) public returns (bool)
```

### _registerMaximumTotalSupply

```solidity
function _registerMaximumTotalSupply(bytes32 _ccy, uint256 _maturity, uint256 totalFVAmount) private
```

