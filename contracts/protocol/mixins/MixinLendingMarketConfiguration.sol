// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// libraries
import {LendingMarketConfigurationLogic} from "../libraries/logics/LendingMarketConfigurationLogic.sol";
// utils
import {Ownable} from "../utils/Ownable.sol";
// storages
import {LendingMarketConfigurationStorage as Storage} from "../storages/LendingMarketConfigurationStorage.sol";

contract MixinLendingMarketConfiguration is Ownable {
    function _initialize(address _owner, uint256 _observationPeriod) internal {
        _transferOwnership(_owner);
        LendingMarketConfigurationLogic.updateObservationPeriod(_observationPeriod);
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
     * @notice Gets the limit range in unit price for the circuit breaker
     * @param _ccy Currency name in bytes32
     * @return The auto-roll fee rate received by protocol
     */
    function getCircuitBreakerLimitRange(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().circuitBreakerLimitRanges[_ccy];
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
        LendingMarketConfigurationLogic.updateOrderFeeRate(_ccy, _orderFeeRate);
    }

    /**
     * @notice Updates the auto-roll fee rate
     * @param _ccy Currency name in bytes32
     * @param _autoRollFeeRate The order fee rate received by protocol
     */
    function updateAutoRollFeeRate(bytes32 _ccy, uint256 _autoRollFeeRate) public onlyOwner {
        LendingMarketConfigurationLogic.updateAutoRollFeeRate(_ccy, _autoRollFeeRate);
    }

    /**
     * @notice Updates the auto-roll fee rate
     * @param _ccy Currency name in bytes32
     * @param _limitRange The circuit breaker limit range
     */
    function updateCircuitBreakerLimitRange(bytes32 _ccy, uint256 _limitRange) public onlyOwner {
        LendingMarketConfigurationLogic.updateCircuitBreakerLimitRange(_ccy, _limitRange);
    }

    /**
     * @notice Updates the observation period
     * @param _observationPeriod The observation period to calculate the volume-weighted average price of transactions
     */
    function updateObservationPeriod(uint256 _observationPeriod) public onlyOwner {
        LendingMarketConfigurationLogic.updateObservationPeriod(_observationPeriod);
    }
}
