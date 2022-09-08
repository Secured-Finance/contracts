// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
// interfaces
import {IBeaconProxyController} from "./interfaces/IBeaconProxyController.sol";
import {IProxyController} from "./interfaces/IProxyController.sol";
// libraries
import {BeaconContracts, Contracts} from "./libraries/Contracts.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
import {UpgradeabilityBeaconProxy} from "./utils/UpgradeabilityBeaconProxy.sol";
// storages
import {BeaconProxyControllerStorage as Storage} from "./storages/BeaconProxyControllerStorage.sol";

/**
 * @notice Implements the management of beacon proxy contracts.
 *
 * All beacon proxy contracts are deployed from this contract.
 * This contract is also used to update the beacon proxy implementation.
 */
contract BeaconProxyController is IBeaconProxyController, MixinAddressResolver, Ownable, Proxyable {
    /**
     * @notice Modifier to make a function callable only by LendingMarketController contract.
     */
    modifier onlyLendingMarketController() {
        require(
            getAddress(Contracts.LENDING_MARKET_CONTROLLER) == msg.sender,
            "Caller is not the LendingMarketController"
        );
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     */
    function initialize(address _owner, address _resolver) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @notice Gets the beacon proxy address to the selected name.
     * @param beaconName The cache name of the beacon proxy
     * @return beaconProxyAddress The beacon proxy address
     */
    function getBeaconProxyAddress(bytes32 beaconName)
        external
        view
        override
        returns (address beaconProxyAddress)
    {
        beaconProxyAddress = Storage.slot().registeredBeaconProxies[beaconName];
        UpgradeabilityBeaconProxy beaconProxy = UpgradeabilityBeaconProxy(
            payable(beaconProxyAddress)
        );

        require(beaconProxy.implementation() != address(0), "Beacon proxy address not found");
    }

    /**
     * @notice Sets the implementation contract of LendingMarket
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketImpl(address newImpl) external override onlyOwner {
        _updateBeaconImpl(BeaconContracts.LENDING_MARKET, newImpl);
    }

    /**
     * @notice Deploys new Lending Market and save address at lendingMarkets mapping.
     * @param _ccy Main currency for new lending market
     * @notice Reverts on deployment market with existing currency and term
     * @return market The proxy contract address of created lending market
     */
    function deployLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _maturity
    ) external override onlyLendingMarketController returns (address market) {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,bytes32,uint256,uint256)",
            address(resolver),
            _ccy,
            _maturity,
            _basisDate
        );
        market = _createProxy(BeaconContracts.LENDING_MARKET, data);
    }

    function _createProxy(bytes32 beaconName, bytes memory data) internal returns (address) {
        address beaconProxyAddress = Storage.slot().registeredBeaconProxies[beaconName];
        require(beaconProxyAddress != address(0), "Beacon proxy is empty");

        return address(new UpgradeabilityBeaconProxy(beaconProxyAddress, data));
    }

    function _updateBeaconImpl(bytes32 name, address newAddress)
        internal
        returns (address beaconProxyAddress)
    {
        beaconProxyAddress = Storage.slot().registeredBeaconProxies[name];
        UpgradeableBeacon beacon;

        if (beaconProxyAddress == address(0)) {
            beacon = new UpgradeableBeacon(newAddress);

            Storage.slot().registeredBeaconProxies[name] = beaconProxyAddress = address(beacon);

            emit BeaconProxyCreated(name, beaconProxyAddress, newAddress);
        } else {
            beacon = UpgradeableBeacon(beaconProxyAddress);
            address oldAddress = beacon.implementation();
            beacon.upgradeTo(newAddress);
            emit BeaconProxyUpdated(name, beaconProxyAddress, newAddress, oldAddress);
        }
    }
}
