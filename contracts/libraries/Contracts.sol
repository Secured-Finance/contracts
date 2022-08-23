// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library Contracts {
    bytes32 internal constant COLLATERAL_AGGREGATOR = "CollateralAggregator";
    bytes32 internal constant COLLATERAL_VAULT = "CollateralVault";
    bytes32 internal constant CROSSCHAIN_ADDRESS_RESOLVER = "CrosschainAddressResolver";
    bytes32 internal constant CURRENCY_CONTROLLER = "CurrencyController";
    bytes32 internal constant LENDING_MARKET_CONTROLLER = "LendingMarketController";
}

library BeaconContracts {
    bytes32 internal constant LENDING_MARKET = "LendingMarket";
    bytes32 internal constant GENESIS_VALUE_TOKEN = "GenesisValueToken";
}
