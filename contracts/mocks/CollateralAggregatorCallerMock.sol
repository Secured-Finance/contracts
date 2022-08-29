// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/ICollateralAggregator.sol";
import "../interfaces/ILendingMarketController.sol";

contract CollateralAggregatorCallerMock {
    ICollateralAggregator public collateralAggregator;
    ILendingMarketController public lendingMarketController;

    constructor(address _collateralAggregator, address _lendingMarketController) {
        collateralAggregator = ICollateralAggregator(_collateralAggregator);
        lendingMarketController = ILendingMarketController(_lendingMarketController);
    }

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        collateralAggregator.useUnsettledCollateral(user, ccy, amount);
    }

    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        collateralAggregator.releaseUnsettledCollateral(user, ccy, amount);
    }

    function getTotalPresentValueInETH(address _account) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInETH(_account);
    }
}
