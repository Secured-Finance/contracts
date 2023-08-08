// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// libraries
import {LendingMarketConfigurationLogic} from "../libraries/logics/LendingMarketConfigurationLogic.sol";
// utils
import {Ownable} from "../utils/Ownable.sol";

contract MixinLendingMarketConfiguration is Ownable {
    function _initialize(address _owner) internal {
        _transferOwnership(_owner);
    }

    /**
     * @notice Gets the order fee rate
     * @param _ccy Currency name in bytes32
     * @return The order fee rate received by protocol
     */
    function getOrderFeeRate(bytes32 _ccy) public view returns (uint256) {
        return LendingMarketConfigurationLogic.getOrderFeeRate(_ccy);
    }

    /**
     * @notice Gets the limit range in unit price for the circuit breaker
     * @param _ccy Currency name in bytes32
     * @return The auto-roll fee rate received by protocol
     */
    function getCircuitBreakerLimitRange(bytes32 _ccy) public view returns (uint256) {
        return LendingMarketConfigurationLogic.getCircuitBreakerLimitRange(_ccy);
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
     * @param _limitRange The circuit breaker limit range
     */
    function updateCircuitBreakerLimitRange(bytes32 _ccy, uint256 _limitRange) public onlyOwner {
        LendingMarketConfigurationLogic.updateCircuitBreakerLimitRange(_ccy, _limitRange);
    }
}
