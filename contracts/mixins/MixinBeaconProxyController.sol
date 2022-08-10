// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/IProxyController.sol";
import "../utils/UpgradeabilityBeaconProxy.sol";

contract MixinBeaconProxyController is IProxyController {
    // Map of registered addresses (name => registeredAddresses)
    mapping(bytes32 => address) private _registeredProxies;
    mapping(bytes32 => address) private _registeredBeaconProxies;

    function _createProxy(bytes32 beaconName, bytes memory data) internal returns (address) {
        address beaconProxyAddress = _registeredBeaconProxies[beaconName];
        require(beaconProxyAddress != address(0), "Beacon proxy is empty");

        return address(new BeaconProxy(beaconProxyAddress, data));
    }

    function _updateBeaconImpl(
        bytes32 name,
        address newAddress,
        bytes memory data
    ) internal returns (address beaconProxyAddress) {
        beaconProxyAddress = _registeredBeaconProxies[name];
        UpgradeabilityBeaconProxy proxy;

        if (beaconProxyAddress == address(0)) {
            proxy = new UpgradeabilityBeaconProxy(payable(newAddress), data);

            _registeredProxies[name] = beaconProxyAddress = address(proxy);

            emit ProxyCreated(name, beaconProxyAddress, newAddress);
        } else {
            proxy = UpgradeabilityBeaconProxy(payable(beaconProxyAddress));
            address oldAddress = proxy.implementation();
            proxy.upgradeTo(newAddress);
            emit ProxyUpdated(name, beaconProxyAddress, newAddress, oldAddress);
        }
    }
}
