// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IProxyController} from "../interfaces/IProxyController.sol";
import {UpgradeabilityBeaconProxy} from "../utils/UpgradeabilityBeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract MixinBeaconProxyController is IProxyController {
    // Map of registered addresses (name => registeredAddresses)
    mapping(bytes32 => address) private _registeredBeaconProxies;

    function _createProxy(bytes32 beaconName, bytes memory data) internal returns (address) {
        address beaconProxyAddress = _registeredBeaconProxies[beaconName];
        require(beaconProxyAddress != address(0), "Beacon proxy is empty");

        return address(new UpgradeabilityBeaconProxy(beaconProxyAddress, data));
    }

    function _updateBeaconImpl(bytes32 name, address newAddress)
        internal
        returns (address beaconProxyAddress)
    {
        beaconProxyAddress = _registeredBeaconProxies[name];
        UpgradeableBeacon beacon;

        if (beaconProxyAddress == address(0)) {
            beacon = new UpgradeableBeacon(newAddress);

            _registeredBeaconProxies[name] = beaconProxyAddress = address(beacon);

            emit ProxyCreated(name, beaconProxyAddress, newAddress);
        } else {
            beacon = UpgradeableBeacon(beaconProxyAddress);
            address oldAddress = beacon.implementation();
            beacon.upgradeTo(newAddress);
            emit ProxyUpdated(name, beaconProxyAddress, newAddress, oldAddress);
        }
    }
}
