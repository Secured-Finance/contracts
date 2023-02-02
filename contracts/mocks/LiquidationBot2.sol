// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";

contract LiquidationBot2 {
    ILendingMarketController lendingMarketController;

    constructor(address _lendingMarketController) {
        lendingMarketController = ILendingMarketController(_lendingMarketController);
    }

    function registerLiquidator(bool isLiquidator) external {
        lendingMarketController.registerLiquidator(isLiquidator);
    }

    function executeLiquidationCall(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) external {
        lendingMarketController.executeLiquidationCall(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user,
            _poolFee
        );
    }
}
