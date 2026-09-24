# Solidity API

## IPausable

### paused

```solidity
function paused() external view returns (bool)
```

## OrderBookIncidentRecovery

Executes the one-time correction for orders affected by the order-book incident.

_This contract must receive OPERATOR_ROLE on LendingMarketController and TokenVault.
It intentionally has no arbitrary-call or asset-rescue function. Revoke both roles after use._

### MAX_CORRECTIONS_PER_BATCH

```solidity
uint256 MAX_CORRECTIONS_PER_BATCH
```

### lendingMarketController

```solidity
contract ILendingMarketController lendingMarketController
```

### tokenVault

```solidity
contract ITokenVault tokenVault
```

### nativeToken

```solidity
address nativeToken
```

### executedBatches

```solidity
mapping(bytes32 => bool) executedBatches
```

### executedCorrections

```solidity
mapping(bytes32 => bool) executedCorrections
```

### executedAssetTransfers

```solidity
mapping(bytes32 => bool) executedAssetTransfers
```

### Correction

```solidity
struct Correction {
  bytes32 correctionId;
  uint256 maturity;
  enum ProtocolTypes.Side side;
  uint256 amount;
  uint256 unitPrice;
}
```

### InvalidAddress

```solidity
error InvalidAddress()
```

### InvalidRecoveryId

```solidity
error InvalidRecoveryId()
```

### InvalidCorrectionCount

```solidity
error InvalidCorrectionCount(uint256 count)
```

### RecoveryAlreadyExecuted

```solidity
error RecoveryAlreadyExecuted(bytes32 recoveryId)
```

### ProtocolNotPaused

```solidity
error ProtocolNotPaused(address target)
```

### InvalidMsgValue

```solidity
error InvalidMsgValue(uint256 expected, uint256 actual)
```

### UnexpectedAssetBalance

```solidity
error UnexpectedAssetBalance(uint256 expected, uint256 actual)
```

### UnexpectedAllowance

```solidity
error UnexpectedAllowance(uint256 actual)
```

### CorrectionExecuted

```solidity
event CorrectionExecuted(bytes32 batchId, bytes32 correctionId, address user, bytes32 ccy, uint256 maturity, enum ProtocolTypes.Side side, uint256 amount, uint256 unitPrice)
```

### CorrectionBatchExecuted

```solidity
event CorrectionBatchExecuted(bytes32 batchId, address user, bytes32 ccy, address fundingSource, uint256 fundingAmount, uint256 correctionCount)
```

### constructor

```solidity
constructor(address _lendingMarketController, address _tokenVault, address _nativeToken, address _owner) public
```

### executeCorrections

```solidity
function executeCorrections(bytes32 _batchId, address _user, bytes32 _ccy, uint256 _fundingAmount, struct OrderBookIncidentRecovery.Correction[] _corrections) external payable
```

Applies offsetting fills for one user and currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _batchId | bytes32 |  |
| _user | address |  |
| _ccy | bytes32 |  |
| _fundingAmount | uint256 | Net asset shortfall to deposit, not the gross corrected PV. |
| _corrections | struct OrderBookIncidentRecovery.Correction[] |  |

### executeAssetTransfer

```solidity
function executeAssetTransfer(bytes32 _ccy, address _user, address _receiver) external
```

Transfers all current FV and GV positions and the remaining Deposit for one user
and currency.

### _prepareFunding

```solidity
function _prepareFunding(bytes32 _ccy, uint256 _fundingAmount) private returns (address token, uint256 balanceBefore)
```

### _finishFunding

```solidity
function _finishFunding(address _token, uint256 _balanceBefore) private
```

