// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";

contract LiquidationBot {
    constructor(
        address _lendingMarketController,
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) {
        ILendingMarketController lendingMarketController = ILendingMarketController(
            _lendingMarketController
        );

        lendingMarketController.registerLiquidator(true);
        lendingMarketController.executeLiquidationCall(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user,
            _poolFee
        );
    }
}
