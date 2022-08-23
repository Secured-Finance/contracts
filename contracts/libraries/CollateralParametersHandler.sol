// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {CollateralParametersStorage as Storage} from "../storages/CollateralParametersStorage.sol";

/**
 * @title CollateralParametersHandler is an internal component of CollateralAggregator contract
 *
 * This contract allows Secured Finance manage the collateral system such as:
 *
 * 1. Update CurrencyController and LiquidationEngine addresses
 * 2. Add different products implementation contracts as collateral users
 * 3. Link deployed collateral vaults
 * 4. Update main collateral parameters like Margin Call ratio,
 *    Auto-Liquidation level, Liquidation price, and Minimal collateral ratio
 *
 */
library CollateralParametersHandler {
    event LiquidationPriceRateUpdated(uint256 previousPrice, uint256 price);
    event AutoLiquidationThresholdRateUpdated(uint256 previousRatio, uint256 ratio);
    event MarginCallThresholdRateUpdated(uint256 previousRatio, uint256 ratio);
    event MinCollateralRateUpdated(uint256 previousRatio, uint256 price);

    /**
     * @dev Gets collateral parameters
     */
    function getCollateralParameters()
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            Storage.slot().marginCallThresholdRate,
            Storage.slot().autoLiquidationThresholdRate,
            Storage.slot().liquidationPriceRate,
            Storage.slot().minCollateralRate
        );
    }

    /**
     * @dev Gets auto liquidation threshold rate
     */
    function autoLiquidationThresholdRate() internal view returns (uint256) {
        return Storage.slot().autoLiquidationThresholdRate;
    }

    /**
     * @dev Gets liquidation price rate
     */
    function liquidationPriceRate() internal view returns (uint256) {
        return Storage.slot().liquidationPriceRate;
    }

    /**
     * @dev Gets margin call threshold rate
     */
    function marginCallThresholdRate() internal view returns (uint256) {
        return Storage.slot().marginCallThresholdRate;
    }

    /**
     * @dev Gets min collateral rate
     */
    function minCollateralRate() internal view returns (uint256) {
        return Storage.slot().minCollateralRate;
    }

    /**
     * @dev Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     *
     * @param _marginCallThresholdRate Margin call threshold ratio
     * @param _autoLiquidationThresholdRate Auto liquidation threshold rate
     * @param _liquidationPriceRate Liquidation price rate
     * @param _minCollateralRate Minimal collateral rate
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate,
        uint256 _minCollateralRate
    ) internal {
        if (_marginCallThresholdRate != Storage.slot().marginCallThresholdRate) {
            _updateMarginCallThresholdRate(_marginCallThresholdRate);
        }

        if (_autoLiquidationThresholdRate != Storage.slot().autoLiquidationThresholdRate) {
            _updateAutoLiquidationThresholdRate(_autoLiquidationThresholdRate);
        }

        if (_liquidationPriceRate != Storage.slot().liquidationPriceRate) {
            _updateLiquidationPriceRate(_liquidationPriceRate);
        }

        if (_minCollateralRate != Storage.slot().minCollateralRate) {
            _updateMinCollateralRate(_minCollateralRate);
        }
    }

    function _updateMarginCallThresholdRate(uint256 _rate) private {
        require(_rate > 0, "Rate is zero");

        emit MarginCallThresholdRateUpdated(Storage.slot().marginCallThresholdRate, _rate);
        Storage.slot().marginCallThresholdRate = _rate;
    }

    function _updateAutoLiquidationThresholdRate(uint256 _rate) private {
        require(_rate > 0, "Rate is zero");
        require(
            _rate < Storage.slot().marginCallThresholdRate,
            "Auto liquidation threshold rate overflow"
        );

        emit AutoLiquidationThresholdRateUpdated(
            Storage.slot().autoLiquidationThresholdRate,
            _rate
        );
        Storage.slot().autoLiquidationThresholdRate = _rate;
    }

    function _updateLiquidationPriceRate(uint256 _rate) private {
        require(_rate > 0, "Rate is zero");
        require(
            _rate < Storage.slot().autoLiquidationThresholdRate,
            "Liquidation price rate overflow"
        );

        emit LiquidationPriceRateUpdated(Storage.slot().liquidationPriceRate, _rate);
        Storage.slot().liquidationPriceRate = _rate;
    }

    function _updateMinCollateralRate(uint256 _rate) private {
        require(_rate > 0, "Rate is zero");
        require(
            _rate < Storage.slot().autoLiquidationThresholdRate,
            "Min collateral rate overflow"
        );

        emit MinCollateralRateUpdated(Storage.slot().minCollateralRate, _rate);
        Storage.slot().minCollateralRate = _rate;
    }
}
