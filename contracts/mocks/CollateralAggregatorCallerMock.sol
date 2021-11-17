// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../ProtocolTypes.sol";
import "../interfaces/ICollateralAggregator.sol";

contract CollateralAggregatorCallerMock is ProtocolTypes {
    
    ICollateralAggregator public collateralAggregator;

    constructor(address _collateralAggregator) public {
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

}