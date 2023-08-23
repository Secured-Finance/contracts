// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {CollateralParametersStorage as Storage} from "../storages/libraries/CollateralParametersStorage.sol";
import {Constants} from "../libraries/Constants.sol";

/**
 * @notice CollateralParametersHandler is an library to handle the main collateral parameters.
 */
library CollateralParametersHandler {
    error InvalidLiquidationThresholdRate();
    error InvalidLiquidationProtocolFeeRate();
    error InvalidLiquidatorFeeRate();

    event AutoLiquidationThresholdRateUpdated(uint256 previousRate, uint256 ratio);
    event LiquidationProtocolFeeRateUpdated(uint256 previousRate, uint256 ratio);
    event LiquidatorFeeRateUpdated(uint256 previousRate, uint256 ratio);

    /**
     * @dev Gets the liquidation threshold rate
     * @return The liquidation threshold rate
     */
    function liquidationThresholdRate() internal view returns (uint256) {
        return Storage.slot().liquidationThresholdRate;
    }

    /**
     * @dev Gets the liquidation fee received by liquidators
     * @return The liquidation fee received by liquidators
     */
    function liquidatorFeeRate() internal view returns (uint256) {
        return Storage.slot().liquidatorFeeRate;
    }

    /**
     * @dev Gets the liquidation protocol fee received by protocol
     * @return The liquidation protocol fee received by protocol
     */
    function liquidationProtocolFeeRate() internal view returns (uint256) {
        return Storage.slot().liquidationProtocolFeeRate;
    }

    /**
     * @dev Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     * @param _liquidationThresholdRate The liquidation threshold rate
     * @param _liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param _liquidatorFeeRate The liquidation fee rate received by liquidators
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(
        uint256 _liquidationThresholdRate,
        uint256 _liquidationProtocolFeeRate,
        uint256 _liquidatorFeeRate
    ) internal {
        if (_liquidationThresholdRate == 0) revert InvalidLiquidationThresholdRate();
        if (_liquidationProtocolFeeRate > Constants.PCT_DIGIT)
            revert InvalidLiquidationProtocolFeeRate();
        if (_liquidatorFeeRate > Constants.PCT_DIGIT) revert InvalidLiquidatorFeeRate();

        if (_liquidationThresholdRate != Storage.slot().liquidationThresholdRate) {
            emit AutoLiquidationThresholdRateUpdated(
                Storage.slot().liquidationThresholdRate,
                _liquidationThresholdRate
            );
            Storage.slot().liquidationThresholdRate = _liquidationThresholdRate;
        }

        if (_liquidationProtocolFeeRate != Storage.slot().liquidationProtocolFeeRate) {
            emit LiquidationProtocolFeeRateUpdated(
                Storage.slot().liquidationProtocolFeeRate,
                _liquidationProtocolFeeRate
            );
            Storage.slot().liquidationProtocolFeeRate = _liquidationProtocolFeeRate;
        }

        if (_liquidatorFeeRate != Storage.slot().liquidatorFeeRate) {
            Storage.slot().liquidatorFeeRate = _liquidatorFeeRate;
            emit LiquidatorFeeRateUpdated(Storage.slot().liquidatorFeeRate, _liquidatorFeeRate);
        }
    }
}
