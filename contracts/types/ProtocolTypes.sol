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
    uint256 internal constant SECONDS_IN_YEAR = 31557600;

    // Lending market common types
    enum Side {
        LEND,
        BORROW
    }
    enum Ccy {
        ETH,
        FIL,
        USDC,
        BTC
    }

    // Collateral common types
    enum CollateralState {
        EMPTY,
        AVAILABLE,
        IN_USE,
        MARGIN_CALL,
        LIQUIDATION_IN_PROGRESS,
        LIQUIDATION
    }
}
