# Solidity API

## ILiquidationReceiver

### OperationExecute

```solidity
event OperationExecute(address liquidator, address user, bytes32 collateralCcy, uint256 receivedCollateralAmount, bytes32 debtCcy, uint256 debtMaturity, uint256 receivedDebtAmount, address initiator)
```

### executeOperation

```solidity
function executeOperation(address liquidator, address user, bytes32 collateralCcy, uint256 receivedCollateralAmount, bytes32 debtCcy, uint256 debtMaturity, uint256 receivedDebtAmount, address initiator) external returns (bool)
```

