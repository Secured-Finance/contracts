// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ILiquidationReceiver {
    event OperationExecuteForCollateral(
        address liquidator,
        address user,
        bytes32 ccy,
        uint256 receivedAmount,
        address initiator
    );
    event OperationExecuteForDebt(
        address liquidator,
        address user,
        bytes32 collateralCcy,
        uint256 receivedCollateralAmount,
        bytes32 debtCcy,
        uint256 debtMaturity,
        uint256 receivedDebtAmount,
        address initiator
    );

    function executeOperationForCollateral(
        address liquidator,
        address user,
        bytes32 ccy,
        uint256 receivedAmount,
        address initiator
    ) external returns (bool);

    function executeOperationForDebt(
        address liquidator,
        address user,
        bytes32 collateralCcy,
        uint256 receivedCollateralAmount,
        bytes32 debtCcy,
        uint256 debtMaturity,
        uint256 receivedDebtAmount,
        address initiator
    ) external returns (bool);
}
