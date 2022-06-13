// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./AddressPacking.sol";

library Contracts {
    bytes32 public constant CLOSE_OUT_NETTING = "CloseOutNetting";
    bytes32 public constant COLLATERAL_AGGREGATOR = "CollateralAggregator";
    bytes32 public constant CROSSCHAIN_ADDRESS_RESOLVER = "CrosschainAddressResolver";
    bytes32 public constant CURRENCY_CONTROLLER = "CurrencyController";
    bytes32 public constant LENDING_MARKET_CONTROLLER = "LendingMarketController";
    bytes32 public constant LIQUIDATIONS = "Liquidations";
    bytes32 public constant MARK_TO_MARKET = "MarkToMarket";
    bytes32 public constant PAYMENT_AGGREGATOR = "PaymentAggregator";
    bytes32 public constant PRODUCT_ADDRESS_RESOLVER = "ProductAddressResolver";
    bytes32 public constant SETTLEMENT_ENGINE = "SettlementEngine";
    bytes32 public constant TERM_STRUCTURE = "TermStructure";
}
