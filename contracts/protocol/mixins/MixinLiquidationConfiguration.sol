// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// libraries
import {Constants} from "../libraries/Constants.sol";
// utils
import {Ownable} from "../utils/Ownable.sol";
// storages
import {TokenVaultStorage as Storage} from "../storages/TokenVaultStorage.sol";

contract MixinLiquidationConfiguration is Ownable {
    error InvalidLiquidationThresholdRate();
    error InvalidFullLiquidationThresholdRate();
    error InvalidLiquidationProtocolFeeRate();
    error InvalidLiquidatorFeeRate();

    event LiquidationThresholdRateUpdated(uint256 previousRate, uint256 ratio);
    event FullLiquidationThresholdRateUpdated(uint256 previousRate, uint256 ratio);
    event LiquidationProtocolFeeRateUpdated(uint256 previousRate, uint256 ratio);
    event LiquidatorFeeRateUpdated(uint256 previousRate, uint256 ratio);

    function _initialize(
        address _owner,
        uint256 _liquidationThresholdRate,
        uint256 _fullLiquidationThresholdRate,
        uint256 _liquidationProtocolFeeRate,
        uint256 _liquidatorFeeRate
    ) internal {
        _transferOwnership(_owner);
        _updateLiquidationConfiguration(
            _liquidationThresholdRate,
            _fullLiquidationThresholdRate,
            _liquidationProtocolFeeRate,
            _liquidatorFeeRate
        );
    }

    /**
     * @dev Gets the liquidation configuration
     * @return liquidationThresholdRate The liquidation threshold rate
     * @return fullLiquidationThresholdRate The full liquidation threshold rate
     * @return liquidationProtocolFeeRate The liquidation fee received by liquidators
     * @return liquidatorFeeRate The liquidation protocol fee received by protocol
     */
    function getLiquidationConfiguration()
        public
        view
        returns (
            uint256 liquidationThresholdRate,
            uint256 fullLiquidationThresholdRate,
            uint256 liquidationProtocolFeeRate,
            uint256 liquidatorFeeRate
        )
    {
        liquidationThresholdRate = Storage.slot().liquidationThresholdRate;
        fullLiquidationThresholdRate = Storage.slot().fullLiquidationThresholdRate;
        liquidationProtocolFeeRate = Storage.slot().liquidationProtocolFeeRate;
        liquidatorFeeRate = Storage.slot().liquidatorFeeRate;
    }

    /**
     * @dev Update the liquidation configuration
     * @param _liquidationThresholdRate The liquidation threshold rate
     * @param _liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param _liquidatorFeeRate The liquidation fee rate received by liquidators
     * @notice Triggers only be contract owner
     */
    function updateLiquidationConfiguration(
        uint256 _liquidationThresholdRate,
        uint256 _fullLiquidationThresholdRate,
        uint256 _liquidationProtocolFeeRate,
        uint256 _liquidatorFeeRate
    ) external onlyOwner {
        _updateLiquidationConfiguration(
            _liquidationThresholdRate,
            _fullLiquidationThresholdRate,
            _liquidationProtocolFeeRate,
            _liquidatorFeeRate
        );
    }

    /**
     * @dev Update the liquidation configuration
     * @param _liquidationThresholdRate The liquidation threshold rate
     * @param _liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param _liquidatorFeeRate The liquidation fee rate received by liquidators
     * @notice Triggers only be contract owner
     */
    function _updateLiquidationConfiguration(
        uint256 _liquidationThresholdRate,
        uint256 _fullLiquidationThresholdRate,
        uint256 _liquidationProtocolFeeRate,
        uint256 _liquidatorFeeRate
    ) private {
        if (_liquidationThresholdRate <= Constants.PCT_DIGIT)
            revert InvalidLiquidationThresholdRate();
        if (
            _fullLiquidationThresholdRate <= Constants.PCT_DIGIT ||
            _fullLiquidationThresholdRate > _liquidationThresholdRate
        ) revert InvalidFullLiquidationThresholdRate();
        if (_liquidationProtocolFeeRate > Constants.PCT_DIGIT)
            revert InvalidLiquidationProtocolFeeRate();
        if (_liquidatorFeeRate > Constants.PCT_DIGIT) revert InvalidLiquidatorFeeRate();

        if (_liquidationThresholdRate != Storage.slot().liquidationThresholdRate) {
            emit LiquidationThresholdRateUpdated(
                Storage.slot().liquidationThresholdRate,
                _liquidationThresholdRate
            );
            Storage.slot().liquidationThresholdRate = _liquidationThresholdRate;
        }

        if (_fullLiquidationThresholdRate != Storage.slot().fullLiquidationThresholdRate) {
            emit FullLiquidationThresholdRateUpdated(
                Storage.slot().fullLiquidationThresholdRate,
                _fullLiquidationThresholdRate
            );
            Storage.slot().fullLiquidationThresholdRate = _fullLiquidationThresholdRate;
        }

        if (_liquidationProtocolFeeRate != Storage.slot().liquidationProtocolFeeRate) {
            emit LiquidationProtocolFeeRateUpdated(
                Storage.slot().liquidationProtocolFeeRate,
                _liquidationProtocolFeeRate
            );
            Storage.slot().liquidationProtocolFeeRate = _liquidationProtocolFeeRate;
        }

        if (_liquidatorFeeRate != Storage.slot().liquidatorFeeRate) {
            emit LiquidatorFeeRateUpdated(Storage.slot().liquidatorFeeRate, _liquidatorFeeRate);
            Storage.slot().liquidatorFeeRate = _liquidatorFeeRate;
        }
    }
}
