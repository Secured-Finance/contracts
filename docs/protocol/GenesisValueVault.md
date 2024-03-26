# Solidity API

## GenesisValueVault

Implements the management of the genesis value as an amount for Lending positions.

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

### isAutoRolled

```solidity
function isAutoRolled(bytes32 _ccy, uint256 _maturity) public view returns (bool)
```

Gets if auto-roll is executed at the maturity.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity |

### getRevision

```solidity
function getRevision() external pure returns (uint256)
```

Gets the revision number of the contract

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The revision number |

### isInitialized

```solidity
function isInitialized(bytes32 _ccy) public view returns (bool)
```

Gets if the currency is initialized.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the currency is initialized or not |

### decimals

```solidity
function decimals(bytes32 _ccy) public view returns (uint8)
```

Gets if the decimals of the genesis value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint8 | The decimals of the genesis value. |

### getTotalLendingSupply

```solidity
function getTotalLendingSupply(bytes32 _ccy) external view returns (uint256)
```

Gets the total supply of lending

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total supply of lending |

### getTotalBorrowingSupply

```solidity
function getTotalBorrowingSupply(bytes32 _ccy) external view returns (uint256)
```

Gets the total supply of borrowing

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total supply of borrowing |

### getBalance

```solidity
function getBalance(bytes32 _ccy, address _user) public view returns (int256)
```

Gets the user balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The user balance |

### getMaturityGenesisValue

```solidity
function getMaturityGenesisValue(bytes32 _ccy, uint256 _maturity) external view returns (int256)
```

Gets the current total supply per maturity

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The current total supply |

### getCurrentMaturity

```solidity
function getCurrentMaturity(bytes32 _ccy) public view returns (uint256)
```

Gets the current maturity

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The current maturity |

### getLendingCompoundFactor

```solidity
function getLendingCompoundFactor(bytes32 _ccy) public view returns (uint256)
```

Gets the lending compound factor

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The lending compound factor |

### getBorrowingCompoundFactor

```solidity
function getBorrowingCompoundFactor(bytes32 _ccy) public view returns (uint256)
```

Gets the borrowing compound factor

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The lending compound factor |

### getAutoRollLog

```solidity
function getAutoRollLog(bytes32 _ccy, uint256 _maturity) external view returns (struct AutoRollLog)
```

Gets the auto-roll log

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct AutoRollLog | The auto-roll log |

### getLatestAutoRollLog

```solidity
function getLatestAutoRollLog(bytes32 _ccy) external view returns (struct AutoRollLog)
```

Gets the latest auto-roll log

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct AutoRollLog | The auto-roll log |

### getTotalLockedBalance

```solidity
function getTotalLockedBalance(bytes32 _ccy) external view returns (uint256)
```

Gets the total locked balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total locked balance |

### calculateFVFromFV

```solidity
function calculateFVFromFV(bytes32 _ccy, uint256 _basisMaturity, uint256 _destinationMaturity, int256 _futureValue) external view returns (int256)
```

Calculates the future value from the basis maturity to the destination maturity using the compound factor.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _basisMaturity | uint256 |  |
| _destinationMaturity | uint256 |  |
| _futureValue | int256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The future value at the destination maturity |

### calculateGVFromFV

```solidity
function calculateGVFromFV(bytes32 _ccy, uint256 _basisMaturity, int256 _futureValue) public view returns (int256)
```

Calculates the genesis value from the future value at the basis maturity using the compound factor.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _basisMaturity | uint256 |  |
| _futureValue | int256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The genesis value |

### calculateFVFromGV

```solidity
function calculateFVFromGV(bytes32 _ccy, uint256 _basisMaturity, int256 _genesisValue) public view returns (int256)
```

Calculates the future value at the basis maturity from the genesis value using the compound factor.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _basisMaturity | uint256 |  |
| _genesisValue | int256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | int256 | The future value |

### initializeCurrencySetting

```solidity
function initializeCurrencySetting(bytes32 _ccy, uint8 _decimals, uint256 _compoundFactor, uint256 _maturity) external
```

Initializes the currency setting.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _decimals | uint8 | Compound factor decimals |
| _compoundFactor | uint256 | Initial compound factor |
| _maturity | uint256 | Initial maturity |

### updateInitialCompoundFactor

```solidity
function updateInitialCompoundFactor(bytes32 _ccy, uint256 _unitPrice) external
```

Update the currency setting.

_This function is allowed to be called only before the initial compound factor is finalized._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _unitPrice | uint256 | The unit price used to calculate the compound factor |

### updateDecimals

```solidity
function updateDecimals(bytes32 _ccy, uint8 _decimals) external
```

Updates the decimals of the genesis value.

_The decimals of ZCTokens were always 36 before the contract upgrade, but they were fixed
to be configured individually. This is a tentative function that configures them manually.
So, this function can be deleted once the decimals of ZCTokens are updated for all currencies._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _decimals | uint8 | Compound factor decimals |

### executeAutoRoll

```solidity
function executeAutoRoll(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice, uint256 _orderFeeRate) external
```

Executes the auto-roll.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | Current maturity |
| _nextMaturity | uint256 | Next maturity to be rolled |
| _unitPrice | uint256 | Unit price of auto-roll |
| _orderFeeRate | uint256 | Order fee rate used to calculate the auto-roll fee |

### _updateAutoRollLogs

```solidity
function _updateAutoRollLogs(bytes32 _ccy, uint256 _maturity, uint256 _nextMaturity, uint256 _unitPrice) private
```

### updateGenesisValueWithFutureValue

```solidity
function updateGenesisValueWithFutureValue(bytes32 _ccy, address _user, uint256 _basisMaturity, int256 _fvAmount) external
```

Updates the user's balance of the genesis value with the input future value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _basisMaturity | uint256 | The basis maturity |
| _fvAmount | int256 | The amount in the future value |

### updateGenesisValueWithResidualAmount

```solidity
function updateGenesisValueWithResidualAmount(bytes32 _ccy, address _user, uint256 _basisMaturity) external
```

Updates the user's balance of the genesis value without the input future value.

_This function is used only in the case that the user is the last person who updates the genesis value at maturity,
and called only one time per maturity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _basisMaturity | uint256 | The basis maturity |

### lock

```solidity
function lock(bytes32 _ccy, address _user, uint256 _amount) public returns (uint256 lockedAmount)
```

Locks user's balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _amount | uint256 | The amount to lock |

| Name | Type | Description |
| ---- | ---- | ----------- |
| lockedAmount | uint256 | The amount locked |

### unlock

```solidity
function unlock(bytes32 _ccy, address _user, uint256 _amount) public
```

Unlocks user's balance.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _amount | uint256 | The amount to lock |

### transferFrom

```solidity
function transferFrom(bytes32 _ccy, address _sender, address _receiver, int256 _amount) external
```

Transfers the genesis value from sender to receiver.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _sender | address | Sender's address |
| _receiver | address | Receiver's address |
| _amount | int256 | Amount of funds to sent |

### cleanUpBalance

```solidity
function cleanUpBalance(bytes32 _ccy, address _user, uint256 _maturity) external
```

Clean up balance of the user per maturity.

_The genesis value of borrowing fluctuates when it is auto-rolled, but it is not updated in real-time.
This function removes the fluctuation amount calculated by lazy evaluation to reduce gas costs._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _maturity | uint256 | The maturity |

### executeForcedReset

```solidity
function executeForcedReset(bytes32 _ccy, address _user) external
```

Forces a reset of the user's genesis value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

### executeForcedReset

```solidity
function executeForcedReset(bytes32 _ccy, uint256 _maturity, address _user, int256 _amountInFV) external returns (int256 removedAmountInFV, int256 balance)
```

Forces a reset of the user's genesis value.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _maturity | uint256 | The maturity |
| _user | address | User's address |
| _amountInFV | int256 | The amount in the future value to reset |

### getBalanceFluctuationByAutoRolls

```solidity
function getBalanceFluctuationByAutoRolls(bytes32 _ccy, address _user, uint256 _maturity) external view returns (int256 fluctuation)
```

Gets the fluctuation amount of genesis value caused by auto-rolls.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |
| _maturity | uint256 | The maturity |

### calculateBalanceFluctuationByAutoRolls

```solidity
function calculateBalanceFluctuationByAutoRolls(bytes32 _ccy, int256 _balance, uint256 _fromMaturity, uint256 _toMaturity) external view returns (int256 fluctuation)
```

Calculates the fluctuation amount of genesis value caused by auto-rolls at a certain maturity

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _balance | int256 | User's balance |
| _fromMaturity | uint256 | The maturity at start |
| _toMaturity | uint256 | The maturity at end |

### _updateBalance

```solidity
function _updateBalance(bytes32 _ccy, address _user, uint256 _maturity, int256 _amount) private
```

### _updateTotalSupply

```solidity
function _updateTotalSupply(bytes32 _ccy, int256 _amount, int256 _balance) private
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

### _updateCompoundFactor

```solidity
function _updateCompoundFactor(bytes32 _ccy, uint256 _unitPrice, uint256 _orderFeeRate, uint256 _duration) private
```

