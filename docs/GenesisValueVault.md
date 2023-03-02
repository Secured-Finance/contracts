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
function getGenesisValue(bytes32 _ccy, address _user) public view returns (int256 balance)
```

### getMaturityGenesisValue

```solidity
function getMaturityGenesisValue(bytes32 _ccy, uint256 _maturity) external view returns (int256)
```

### getCurrentMaturity

```solidity
function getCurrentMaturity(bytes32 _ccy) public view returns (uint256)
```

### getLendingCompoundFactor

```solidity
function getLendingCompoundFactor(bytes32 _ccy) public view returns (uint256)
```

### getBorrowingCompoundFactor

```solidity
function getBorrowingCompoundFactor(bytes32 _ccy) public view returns (uint256)
```

### getAutoRollLog

```solidity
function getAutoRollLog(bytes32 _ccy, uint256 _maturity) public view returns (struct AutoRollLog)
```

### getGenesisValueInFutureValue

```solidity
function getGenesisValueInFutureValue(bytes32 _ccy, address _user) public view returns (int256)
```

### calculateFVFromFV

```solidity
function calculateFVFromFV(bytes32 _ccy, uint256 _basisMaturity, uint256 _destinationMaturity, int256 _futureValue) public view returns (int256)
```

### calculateGVFromFV

```solidity
function calculateGVFromFV(bytes32 _ccy, uint256 _basisMaturity, int256 _futureValue) public view returns (int256)
```

### calculateFVFromGV

```solidity
function calculateFVFromGV(bytes32 _ccy, uint256 _basisMaturity, int256 _genesisValue) public view returns (int256)
```

### initializeCurrencySetting

```solidity
function initializeCurrencySetting(bytes32 _ccy, uint8 _decimals, uint256 _compoundFactor, uint256 _maturity) external
```

### executeAutoRoll

```solidity
function executeAutoRoll(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice, uint256 _feeRate, uint256 _totalFVAmount) external
```

### _updateCompoundFactor

```solidity
function _updateCompoundFactor(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice, uint256 _feeRate) private
```

### updateGenesisValueWithFutureValue

```solidity
function updateGenesisValueWithFutureValue(bytes32 _ccy, address _user, uint256 _basisMaturity, int256 _fvAmount) external
```

### updateGenesisValueWithResidualAmount

```solidity
function updateGenesisValueWithResidualAmount(bytes32 _ccy, address _user, uint256 _basisMaturity) external
```

### offsetGenesisValue

```solidity
function offsetGenesisValue(bytes32 _ccy, uint256 _maturity, address _lender, address _borrower, int256 _maximumGVAmount) external returns (int256 offsetAmount)
```

### cleanUpGenesisValue

```solidity
function cleanUpGenesisValue(bytes32 _ccy, address _user, uint256 _maturity) external
```

### getBalanceFluctuationByAutoRolls

```solidity
function getBalanceFluctuationByAutoRolls(bytes32 _ccy, address _user, uint256 _maturity) external view returns (int256 fluctuation)
```

### calculateBalanceFluctuationByAutoRolls

```solidity
function calculateBalanceFluctuationByAutoRolls(bytes32 _ccy, int256 _balance, uint256 _fromMaturity, uint256 _toMaturity) external view returns (int256 fluctuation)
```

### _updateBalance

```solidity
function _updateBalance(bytes32 _ccy, address _user, uint256 _maturity, int256 _amount) private
```

### _updateTotalSupplies

```solidity
function _updateTotalSupplies(bytes32 _ccy, int256 _amount, int256 _balance) private
```

### _registerMaximumTotalSupply

```solidity
function _registerMaximumTotalSupply(bytes32 _ccy, uint256 _maturity, uint256 _totalFVAmount) private
```

### _getActualBalance

```solidity
function _getActualBalance(bytes32 _ccy, address _user, uint256 _maturity) private view returns (int256 balance, int256 fluctuation)
```

### _getBalanceFluctuationByAutoRolls

```solidity
function _getBalanceFluctuationByAutoRolls(bytes32 _ccy, address _user, uint256 _maturity) private view returns (int256 fluctuation)
```

Calculates the fluctuation amount of genesis value caused by auto-rolls.

_The genesis value means the present value of the lending position at the time
when the initial market is opened, so the genesis value amount will fluctuate
by the fee rate due to auto-rolls if it is negative (equals to the borrowing position)._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency for pausing all lending markets |
| _user | address | User's address |
| _maturity | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| fluctuation | int256 | The fluctuated genesis value amount |

### _calculateBalanceFluctuationByAutoRolls

```solidity
function _calculateBalanceFluctuationByAutoRolls(bytes32 _ccy, int256 _balance, uint256 _fromMaturity, uint256 _toMaturity) private view returns (int256 fluctuation)
```

