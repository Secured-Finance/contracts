// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/**
 * @dev ProtocolTypes is a base-level contract that holds common Secured Finance protocol types
 * @author Secured Finance
 */
contract ProtocolTypes {
    // Constant values
    uint8 internal constant NUMCCY = 3;
    uint8 internal constant NUMTERM = 6;
    uint8 internal constant NUMDF = 7; // number of discount factors
    uint256 internal constant BP = 10000; // basis point

    uint256 internal constant PCT = 10000; // percentage point in basis
    uint256 internal constant PENALTYLEVEL = 1000; // 10% settlement failure penalty
    uint256 internal constant MKTMAKELEVEL = 2000; // 20% for market making

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

    // Loan common types
    enum LoanState {
        REGISTERED,
        WORKING,
        DUE,
        PAST_DUE,
        CLOSED,
        TERMINATED
    }
    enum DFTERM {
        _3m,
        _6m,
        _1y,
        _2y,
        _3y,
        _4y,
        _5y
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

    // FXMarket common types
    enum CcyPair {
        FILETH,
        FILUSDC,
        ETHUSDC,
        BTCUSDC,
        BTCETH,
        BTCFIL
    }
    enum FXSide {
        BID,
        OFFER
    }

    enum PaymentFrequency {
        ANNUAL,
        SEMI_ANNUAL,
        QUARTERLY,
        MONTHLY,
        FORWARD
    }
}
