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
    uint256 internal constant PCT = 100; // percentage point
    uint256 internal constant MKTMAKELEVEL = 20; // 20% for market making

    // Lending market common types
    enum Side {
        LEND,
        BORROW
    }
    enum Ccy {ETH, FIL, USDC, BTC}
    enum Term {_3m, _6m, _1y, _2y, _3y, _5y}

    // Mark to market mechanism
    struct DiscountFactor{
        uint256 df3m;
        uint256 df6m;
        uint256 df1y;
        uint256 df2y;
        uint256 df3y;
        uint256 df4y;
        uint256 df5y;
    }

    // Loan common types
    enum LoanState {REGISTERED, WORKING, DUE, PAST_DUE, CLOSED, TERMINATED}
    enum DFTERM {_3m, _6m, _1y, _2y, _3y, _4y, _5y}

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
    enum CcyPair {FILETH, FILUSDC, ETHUSDC, BTCUSD, BTCETH, BTCFIL}
    enum FXSide {BID, OFFER}
}