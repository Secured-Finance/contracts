// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// libraries
import {RoundingUint256} from "../libraries/math/RoundingUint256.sol";
// types
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
// storages
import {LendingMarketManagerStorage as Storage} from "../storages/LendingMarketManagerStorage.sol";

contract MixinLendingMarketManager {
    using RoundingUint256 for uint256;

    event OrderFeeRateUpdated(uint256 previousRate, uint256 rate);
    event AutoRollFeeRateUpdated(uint256 previousRate, uint256 rate);

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
     * @notice Updates the order fee rate
     * @param _ccy Currency name in bytes32
     * @param _orderFeeRate The order fee rate received by protocol
     */
    function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) public {
        require(_orderFeeRate <= ProtocolTypes.PCT_DIGIT, "Invalid order fee rate");
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
    function updateAutoRollFeeRate(bytes32 _ccy, uint256 _autoRollFeeRate) public {
        require(_autoRollFeeRate <= ProtocolTypes.PCT_DIGIT, "Invalid auto-roll fee rate");
        uint256 previousRate = Storage.slot().autoRollFeeRates[_ccy];

        if (_autoRollFeeRate != previousRate) {
            Storage.slot().autoRollFeeRates[_ccy] = _autoRollFeeRate;

            emit AutoRollFeeRateUpdated(previousRate, _autoRollFeeRate);
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
            ProtocolTypes.SECONDS_IN_YEAR * ProtocolTypes.PCT_DIGIT
        );
    }
}
