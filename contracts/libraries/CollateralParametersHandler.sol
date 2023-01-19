// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import {CollateralParametersStorage as Storage} from "../storages/CollateralParametersStorage.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";

/**
 * @notice CollateralParametersHandler is an library to handle the parameters fro TokenVault contract.
 *
 * This manage the main collateral parameters like Margin Call ratio, Auto-Liquidation level,
 * Liquidation price, and Minimal collateral ratio.
 *
 */
library CollateralParametersHandler {
    event UpdateAutoLiquidationThresholdRate(uint256 previousRate, uint256 ratio);
    event UpdateLiquidationUserFeeRate(uint256 previousRate, uint256 ratio);
    event UpdateLiquidationProtocolFeeRate(uint256 previousRate, uint256 ratio);
    event UpdateUniswapRouter(address previousUniswapRouter, address uniswapRouter);
    event UpdateUniswapQuoter(address previousUniswapQuoter, address uniswapQuoter);

    /**
     * @dev Gets the liquidation threshold rate
     * @return The liquidation threshold rate
     */
    function liquidationThresholdRate() internal view returns (uint256) {
        return Storage.slot().liquidationThresholdRate;
    }

    /**
     * @dev Gets the liquidation fee received by users
     * @return The liquidation fee received by users
     */
    function liquidationUserFeeRate() internal view returns (uint256) {
        return Storage.slot().liquidationUserFeeRate;
    }

    /**
     * @dev Gets the liquidation protocol fee received by protocol
     * @return The liquidation protocol fee received by protocol
     */
    function liquidationProtocolFeeRate() internal view returns (uint256) {
        return Storage.slot().liquidationProtocolFeeRate;
    }

    /**
     * @dev Gets Uniswap Router contract address
     */
    function uniswapRouter() internal view returns (ISwapRouter) {
        return Storage.slot().uniswapRouter;
    }

    /**
     * @dev Gets Uniswap Quoter contract address
     */
    function uniswapQuoter() internal view returns (IQuoter) {
        return Storage.slot().uniswapQuoter;
    }

    /**
     * @dev Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     * @param _liquidationThresholdRate Auto liquidation threshold rate
     * @param _liquidationUserFeeRate Liquidation fee received by users
     * @param _liquidationProtocolFeeRate Liquidation fee received by protocol
     * @param _uniswapRouter Uniswap router contract address
     * @param _uniswapQuoter Uniswap quoter contract address
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(
        uint256 _liquidationThresholdRate,
        uint256 _liquidationUserFeeRate,
        uint256 _liquidationProtocolFeeRate,
        address _uniswapRouter,
        address _uniswapQuoter
    ) internal {
        require(_liquidationThresholdRate > 0, "Invalid liquidation threshold rate");
        require(
            _liquidationUserFeeRate <= ProtocolTypes.PCT_DIGIT,
            "Invalid liquidation user fee rate"
        );
        require(
            _liquidationProtocolFeeRate <= ProtocolTypes.PCT_DIGIT,
            "Invalid liquidation protocol fee rate"
        );
        require(_uniswapRouter != address(0), "Invalid Uniswap Router");
        require(_uniswapQuoter != address(0), "Invalid Uniswap Quoter");

        if (_liquidationThresholdRate != Storage.slot().liquidationThresholdRate) {
            emit UpdateAutoLiquidationThresholdRate(
                Storage.slot().liquidationThresholdRate,
                _liquidationThresholdRate
            );
            Storage.slot().liquidationThresholdRate = _liquidationThresholdRate;
        }

        if (_liquidationUserFeeRate != Storage.slot().liquidationUserFeeRate) {
            emit UpdateLiquidationUserFeeRate(
                Storage.slot().liquidationUserFeeRate,
                _liquidationUserFeeRate
            );
            Storage.slot().liquidationUserFeeRate = _liquidationUserFeeRate;
        }

        if (_liquidationProtocolFeeRate != Storage.slot().liquidationProtocolFeeRate) {
            emit UpdateLiquidationProtocolFeeRate(
                Storage.slot().liquidationProtocolFeeRate,
                _liquidationProtocolFeeRate
            );
            Storage.slot().liquidationProtocolFeeRate = _liquidationProtocolFeeRate;
        }

        if (_uniswapRouter != address(Storage.slot().uniswapRouter)) {
            emit UpdateUniswapRouter(address(Storage.slot().uniswapRouter), _uniswapRouter);
            Storage.slot().uniswapRouter = ISwapRouter(_uniswapRouter);
        }

        if (_uniswapQuoter != address(Storage.slot().uniswapQuoter)) {
            emit UpdateUniswapQuoter(address(Storage.slot().uniswapQuoter), _uniswapQuoter);
            Storage.slot().uniswapQuoter = IQuoter(_uniswapQuoter);
        }
    }
}
