// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library Constants {
    /// @dev Used for price digits in the basis (10000 -> 1)
    uint256 public constant PRICE_DIGIT = 10000;

    /// @dev Used for percentage digits in the basis (10000 -> 100%)
    uint256 public constant PCT_DIGIT = 10000;

    /// @dev Used for seconds in year (60 * 60 * 24 * 365)
    uint256 internal constant SECONDS_IN_YEAR = 31536000;

    /// @dev Used for maximum order count per currency
    uint256 internal constant MAXIMUM_ORDER_COUNT = 20;

    /// @dev Used for minimum threshold for circuit breaker unitprice threshold
    uint256 public constant MINIMUM_CIRCUIT_BREAKER_THRESHOLD = 10;

    /// @dev Used for maximum threshold for circuit breaker unitprice threshold
    uint256 public constant MAXIMUM_CIRCUIT_BREAKER_THRESHOLD = 200;
}
