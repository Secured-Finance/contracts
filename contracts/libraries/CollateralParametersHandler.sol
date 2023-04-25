// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import {CollateralParametersStorage as Storage} from "../storages/CollateralParametersStorage.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";

/**
 * @notice CollateralParametersHandler is an library to handle the main collateral parameters.
 */
library CollateralParametersHandler {
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
        require(_liquidationThresholdRate > 0, "Invalid liquidation threshold rate");
        require(
            _liquidationProtocolFeeRate <= ProtocolTypes.PCT_DIGIT,
            "Invalid liquidation protocol fee rate"
        );
        require(_liquidatorFeeRate <= ProtocolTypes.PCT_DIGIT, "Invalid liquidator fee rate");

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
