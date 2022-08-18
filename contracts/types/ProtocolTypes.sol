// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @dev ProtocolTypes is a base-level contract that holds common Secured Finance protocol types
 * @author Secured Finance
 */
library ProtocolTypes {
    // Constant values
    uint256 public constant BP = 10000; // basis point
    uint256 public constant PCT = 10000; // percentage point in basis
    uint256 public constant PENALTYLEVEL = 1000; // 10% settlement failure penalty
    uint256 public constant MKTMAKELEVEL = 2000; // 20% for market making

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

    struct Currency {
        bool isSupported;
        string name;
        uint16 chainId; // chain id for address conversion
    }

    struct SettlementRequest {
        address payer;
        address receiver;
        uint16 chainId;
        uint256 timestamp;
        string txHash;
    }
}
