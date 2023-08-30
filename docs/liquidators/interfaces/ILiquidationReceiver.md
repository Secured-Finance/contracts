# Solidity API

## ILiquidationReceiver

### InvalidOperationExecution

```solidity
error InvalidOperationExecution()
```

### OperationExecuteForCollateral

```solidity
event OperationExecuteForCollateral(address liquidator, address user, bytes32 ccy, uint256 receivedAmount)
```

### OperationExecuteForDebt

```solidity
event OperationExecuteForDebt(address liquidator, address user, bytes32 collateralCcy, uint256 receivedCollateralAmount, bytes32 debtCcy, uint256 debtMaturity, uint256 receivedDebtAmount)
```

### executeOperationForCollateral

```solidity
function executeOperationForCollateral(address liquidator, address user, bytes32 ccy, uint256 receivedAmount) external returns (bool)
```

### executeOperationForDebt

```solidity
function executeOperationForDebt(address liquidator, address user, bytes32 collateralCcy, uint256 receivedCollateralAmount, bytes32 debtCcy, uint256 debtMaturity, uint256 receivedDebtAmount) external returns (bool)
```

