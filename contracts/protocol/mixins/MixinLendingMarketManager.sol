// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// libraries
import {Constants} from "../libraries/Constants.sol";
import {RoundingUint256} from "../libraries/math/RoundingUint256.sol";
// utils
import {Ownable} from "../utils/Ownable.sol";
// storages
import {LendingMarketManagerStorage as Storage} from "../storages/LendingMarketManagerStorage.sol";

contract MixinLendingMarketManager is Ownable {
    using RoundingUint256 for uint256;

    event OrderFeeRateUpdated(uint256 previousRate, uint256 rate);
    event AutoRollFeeRateUpdated(uint256 previousRate, uint256 rate);
    event ObservationPeriodUpdated(uint256 previousPeriod, uint256 period);

    function _initialize(address _owner, uint256 _observationPeriod) internal {
        _transferOwnership(_owner);
        _updateObservationPeriod(_observationPeriod);
    }

    /**
     * @notice Gets the order fee rate
     * @param _ccy Currency name in bytes32
     * @return The order fee rate received by protocol
     */
    function getOrderFeeRate(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().orderFeeRates[_ccy];
    }

    /**
     * @notice Gets the auto-roll fee rate
     * @param _ccy Currency name in bytes32
     * @return The auto-roll fee rate received by protocol
     */
    function getAutoRollFeeRate(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().autoRollFeeRates[_ccy];
    }

    /**
     * @notice Gets the observation period
     * @return The observation period to calculate the volume-weighted average price of transactions
     */
    function getObservationPeriod() public view returns (uint256) {
        return Storage.slot().observationPeriod;
    }

    /**
     * @notice Updates the order fee rate
     * @param _ccy Currency name in bytes32
     * @param _orderFeeRate The order fee rate received by protocol
     */
    function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) public onlyOwner {
        require(_orderFeeRate <= Constants.PCT_DIGIT, "Invalid order fee rate");
        uint256 previousRate = Storage.slot().orderFeeRates[_ccy];

        if (_orderFeeRate != previousRate) {
            Storage.slot().orderFeeRates[_ccy] = _orderFeeRate;

            emit OrderFeeRateUpdated(previousRate, _orderFeeRate);
        }
    }

    /**
     * @notice Updates the auto-roll fee rate
     * @param _ccy Currency name in bytes32
     * @param _autoRollFeeRate The order fee rate received by protocol
     */
    function updateAutoRollFeeRate(bytes32 _ccy, uint256 _autoRollFeeRate) public onlyOwner {
        require(_autoRollFeeRate <= Constants.PCT_DIGIT, "Invalid auto-roll fee rate");
        uint256 previousRate = Storage.slot().autoRollFeeRates[_ccy];

        if (_autoRollFeeRate != previousRate) {
            Storage.slot().autoRollFeeRates[_ccy] = _autoRollFeeRate;

            emit AutoRollFeeRateUpdated(previousRate, _autoRollFeeRate);
        }
    }

    /**
     * @notice Updates the observation period
     * @param _observationPeriod The observation period to calculate the volume-weighted average price of transactions
     */
    function updateObservationPeriod(uint256 _observationPeriod) public onlyOwner {
        _updateObservationPeriod(_observationPeriod);
    }

    function _updateObservationPeriod(uint256 _observationPeriod) internal {
        uint256 previousPeriod = Storage.slot().observationPeriod;

        if (_observationPeriod != previousPeriod) {
            Storage.slot().observationPeriod = _observationPeriod;

            emit ObservationPeriodUpdated(previousPeriod, _observationPeriod);
        }
    }

    function _calculateOrderFeeAmount(
        bytes32 _ccy,
        uint256 _amount,
        uint256 _maturity
    ) internal view returns (uint256 orderFeeAmount) {
        require(block.timestamp < _maturity, "Invalid maturity");
        uint256 currentMaturity = _maturity - block.timestamp;

        // NOTE: The formula is:
        // actualRate = feeRate * (currentMaturity / SECONDS_IN_YEAR)
        // orderFeeAmount = amount * actualRate
        orderFeeAmount = (Storage.slot().orderFeeRates[_ccy] * currentMaturity * _amount).div(
            Constants.SECONDS_IN_YEAR * Constants.PCT_DIGIT
        );
    }
}
