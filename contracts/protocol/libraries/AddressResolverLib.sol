// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {Contracts} from "../libraries/Contracts.sol";
import {IBeaconProxyController} from "../interfaces/IBeaconProxyController.sol";
import {ICurrencyController} from "../interfaces/ICurrencyController.sol";
import {IGenesisValueVault} from "../interfaces/IGenesisValueVault.sol";
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";
import {IReserveFund} from "../interfaces/IReserveFund.sol";
import {ITokenVault} from "../interfaces/ITokenVault.sol";
import {MixinAddressResolverStorage as Storage} from "../storages/mixins/MixinAddressResolverStorage.sol";

library AddressResolverLib {
    error MissingAddress(string name);

    function getAddress(bytes32 name) internal view returns (address) {
        address _foundAddress = Storage.slot().addressCache[name];
        if (_foundAddress == address(0)) revert MissingAddress(string(abi.encodePacked(name)));
        return _foundAddress;
    }

    function beaconProxyController() internal view returns (IBeaconProxyController) {
        return IBeaconProxyController(getAddress(Contracts.BEACON_PROXY_CONTROLLER));
    }

    function currencyController() internal view returns (ICurrencyController) {
        return ICurrencyController(getAddress(Contracts.CURRENCY_CONTROLLER));
    }

    function genesisValueVault() internal view returns (IGenesisValueVault) {
        return IGenesisValueVault(getAddress(Contracts.GENESIS_VALUE_VAULT));
    }

    function lendingMarketController() internal view returns (ILendingMarketController) {
        return ILendingMarketController(getAddress(Contracts.LENDING_MARKET_CONTROLLER));
    }

    function reserveFund() internal view returns (IReserveFund) {
        return IReserveFund(getAddress(Contracts.RESERVE_FUND));
    }

    function tokenVault() internal view returns (ITokenVault) {
        return ITokenVault(getAddress(Contracts.TOKEN_VAULT));
    }
}
