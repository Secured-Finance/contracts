// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @dev ProtocolTypes is a base-level contract that holds common Secured Finance protocol types
 * @author Secured Finance
 */
library ProtocolTypes {
    // Constant values
    uint256 public constant PRICE_DIGIT = 10000; // price digit in the basis (10000 -> 1)
    uint256 public constant PCT_DIGIT = 10000; // percentage digit in the basis (10000 -> 100%)

    uint256 internal constant DAYS_IN_YEAR = 365;
    uint256 internal constant SECONDS_IN_MONTH = 2592000; // 60 * 60 * 24 * 30 * 12
    uint256 internal constant SECONDS_IN_YEAR = 31536000; // 60 * 60 * 24 * 365

    uint256 internal constant BASIS_TERM = 3;
    uint256 internal constant MAXIMUM_ORDER_COUNT = 20;

    // Lending market common types
    enum Side {
        LEND,
        BORROW
    }
}
