// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ILiquidator {
    event OperationExecute(
        address liquidator,
        address user,
        bytes32 collateralCcy,
        uint256 receivedCollateralAmount,
        bytes32 debtCcy,
        uint256 debtMaturity,
        uint256 receivedDebtAmount,
        address initiator
    );

    function executeOperation(
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
