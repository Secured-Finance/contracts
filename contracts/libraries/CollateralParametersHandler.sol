// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IUniswapV2Router02} from "../dependencies/uniswap/IUniswapV2Router02.sol";
import {CollateralParametersStorage as Storage} from "../storages/CollateralParametersStorage.sol";

/**
 * @notice CollateralParametersHandler is an library to handle the parameters fro TokenVault contract.
 *
 * This manage the main collateral parameters like Margin Call ratio, Auto-Liquidation level,
 * Liquidation price, and Minimal collateral ratio.
 *
 */
library CollateralParametersHandler {
    event UpdateAutoLiquidationThresholdRate(uint256 previousRatio, uint256 ratio);
    event UpdateUniswapRouter(address previousUniswapRouter, address uniswapRouter);

    /**
     * @dev Gets liquidation threshold rate
     */
    function liquidationThresholdRate() internal view returns (uint256) {
        return Storage.slot().liquidationThresholdRate;
    }

    /**
     * @dev Gets min collateral rate
     */
    function uniswapRouter() internal view returns (IUniswapV2Router02) {
        return Storage.slot().uniswapRouter;
    }

    /**
     * @dev Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     *
     * @param _liquidationThresholdRate Auto liquidation threshold rate
     * @param _uniswapRouter Uniswap router contract address
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(uint256 _liquidationThresholdRate, address _uniswapRouter)
        internal
    {
        if (_liquidationThresholdRate != Storage.slot().liquidationThresholdRate) {
            _updateAutoLiquidationThresholdRate(_liquidationThresholdRate);
        }

        if (_uniswapRouter != address(Storage.slot().uniswapRouter)) {
            _updateUniswapRouter(_uniswapRouter);
        }
    }

    function _updateAutoLiquidationThresholdRate(uint256 _rate) private {
        require(_rate > 0, "Rate is zero");

        emit UpdateAutoLiquidationThresholdRate(Storage.slot().liquidationThresholdRate, _rate);
        Storage.slot().liquidationThresholdRate = _rate;
    }

    function _updateUniswapRouter(address _uniswapRouter) private {
        require(_uniswapRouter != address(0), "Invalid Uniswap Router");

        emit UpdateUniswapRouter(address(Storage.slot().uniswapRouter), _uniswapRouter);
        Storage.slot().uniswapRouter = IUniswapV2Router02(_uniswapRouter);
    }
}
