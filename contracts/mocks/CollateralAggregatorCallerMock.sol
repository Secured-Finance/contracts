// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../ProtocolTypes.sol";
import "../interfaces/ICollateralAggregatorV2.sol";

contract CollateralAggregatorCallerMock is ProtocolTypes {
    ICollateralAggregator public collateralAggregator;

    constructor(address _collateralAggregator) {
        collateralAggregator = ICollateralAggregator(_collateralAggregator);
    }

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        collateralAggregator.useUnsettledCollateral(user, ccy, amount);
    }

    function useCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) public {
        collateralAggregator.useCollateral(partyA, partyB, ccy, amount0, amount1, isSettled);
    }

    function settleCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1
    ) public {
        collateralAggregator.settleCollateral(partyA, partyB, ccy, amount0, amount1);
    }

    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        collateralAggregator.releaseUnsettledCollateral(user, ccy, amount);
    }

    function releaseCollateral(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 amount0,
        uint256 amount1,
        bool isSettled
    ) public {
        collateralAggregator.releaseCollateral(partyA, partyB, ccy, amount0, amount1, isSettled);
    }

    function updatePV(
        address partyA,
        address partyB,
        bytes32 ccy,
        uint256 prevPV0,
        uint256 prevPV1,
        uint256 currentPV0,
        uint256 currentPV1
    ) external {
        collateralAggregator.updatePV(
            partyA,
            partyB,
            ccy,
            prevPV0,
            prevPV1,
            currentPV0,
            currentPV1
        );
    }

    function liquidate(
        address from,
        address to,
        bytes32 ccy,
        uint256 liquidationAmount,
        uint256 pvForRelease,
        bool isSettled
    ) external {
        collateralAggregator.liquidate(from, to, ccy, liquidationAmount, pvForRelease, isSettled);
    }

    function liquidate(
        address from,
        address to,
        uint256 liquidationInETH
    ) external {
        collateralAggregator.liquidate(from, to, liquidationInETH);
    }
}
