// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// libraries
import {Constants} from "../../libraries/Constants.sol";
import {RoundingUint256} from "../../libraries/math/RoundingUint256.sol";
// storages
import {LendingMarketConfigurationStorage as Storage} from "../../storages/LendingMarketConfigurationStorage.sol";

library LendingMarketConfigurationLogic {
    using RoundingUint256 for uint256;

    event OrderFeeRateUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event AutoRollFeeRateUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event CircuitBreakerLimitRangeUpdated(bytes32 ccy, uint256 previousRate, uint256 rate);
    event ObservationPeriodUpdated(uint256 previousPeriod, uint256 period);

    function getCircuitBreakerLimitRange(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().circuitBreakerLimitRanges[_ccy];
    }

    function getOrderFeeRate(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().orderFeeRates[_ccy];
    }

    function getObservationPeriod() public view returns (uint256) {
        return Storage.slot().observationPeriod;
    }

    function calculateOrderFeeAmount(
        bytes32 _ccy,
        uint256 _amount,
        uint256 _maturity
    ) external view returns (uint256 orderFeeAmount) {
        require(block.timestamp < _maturity, "Invalid maturity");
        uint256 currentMaturity = _maturity - block.timestamp;

        // NOTE: The formula is:
        // actualRate = feeRate * (currentMaturity / SECONDS_IN_YEAR)
        // orderFeeAmount = amount * actualRate
        orderFeeAmount = (Storage.slot().orderFeeRates[_ccy] * currentMaturity * _amount).div(
            Constants.SECONDS_IN_YEAR * Constants.PCT_DIGIT
        );
    }

    function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) external {
        require(_orderFeeRate <= Constants.PCT_DIGIT, "Invalid order fee rate");
        uint256 previousRate = Storage.slot().orderFeeRates[_ccy];

        if (_orderFeeRate != previousRate) {
            Storage.slot().orderFeeRates[_ccy] = _orderFeeRate;

            emit OrderFeeRateUpdated(_ccy, previousRate, _orderFeeRate);
        }
    }

    function updateAutoRollFeeRate(bytes32 _ccy, uint256 _autoRollFeeRate) external {
        require(_autoRollFeeRate <= Constants.PCT_DIGIT, "Invalid auto-roll fee rate");
        uint256 previousRate = Storage.slot().autoRollFeeRates[_ccy];

        if (_autoRollFeeRate != previousRate) {
            Storage.slot().autoRollFeeRates[_ccy] = _autoRollFeeRate;

            emit AutoRollFeeRateUpdated(_ccy, previousRate, _autoRollFeeRate);
        }
    }

    function updateCircuitBreakerLimitRange(bytes32 _ccy, uint256 _limitRange) external {
        require(_limitRange <= Constants.PCT_DIGIT, "Invalid circuit breaker limit range");
        uint256 previousRange = Storage.slot().circuitBreakerLimitRanges[_ccy];

        if (_limitRange != previousRange) {
            Storage.slot().circuitBreakerLimitRanges[_ccy] = _limitRange;

            emit CircuitBreakerLimitRangeUpdated(_ccy, previousRange, _limitRange);
        }
    }

    function updateObservationPeriod(uint256 _observationPeriod) external {
        uint256 previousPeriod = Storage.slot().observationPeriod;

        if (_observationPeriod != previousPeriod) {
            Storage.slot().observationPeriod = _observationPeriod;

            emit ObservationPeriodUpdated(previousPeriod, _observationPeriod);
        }
    }
}
