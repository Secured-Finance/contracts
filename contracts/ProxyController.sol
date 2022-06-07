// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IProxyController.sol";
import "./libraries/Contracts.sol";
import "./mixins/MixinAddressResolver.sol";
import "./utils/UpgradeabilityProxy.sol";

contract ProxyController is IProxyController, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // Map of registered addresses (name => registeredAddresses)
    mapping(bytes32 => address) private _registeredProxies;
    EnumerableSet.AddressSet private _registeredProxySet;
    EnumerableSet.Bytes32Set private _registeredContractNameSet;

    IAddressResolver private resolver;

    constructor(address _resolver) Ownable() {
        resolver = IAddressResolver(_resolver);
    }

    function setCurrencyControllerImpl(address newPoolImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        _updateImpl(Contracts.CURRENCY_CONTROLLER, newPoolImpl, data);
    }

    function getCurrencyControllerAddress() external view returns (address) {
        return _registeredProxies[Contracts.CURRENCY_CONTROLLER];
    }

    function registeredProxies() external view returns (address[] memory) {
        return _registeredProxySet.values();
    }

    function registeredContractNames() external view returns (bytes32[] memory) {
        return _registeredContractNameSet.values();
    }

    function _updateImpl(
        bytes32 name,
        address newAddress,
        bytes memory data
    ) internal {
        address proxyAddress = resolver.getAddress(name);
        UpgradeabilityProxy proxy;

        if (proxyAddress == address(0)) {
            proxy = new UpgradeabilityProxy(payable(newAddress), data);

            _registeredProxies[name] = proxyAddress = address(proxy);
            _registeredProxySet.add(proxyAddress);
            _registeredContractNameSet.add(name);

            emit ProxyCreated(Contracts.CURRENCY_CONTROLLER, proxyAddress, newAddress);
        } else {
            proxy = UpgradeabilityProxy(payable(proxyAddress));
            address oldAddress = proxy.implementation();
            proxy.upgradeTo(newAddress);
            emit ProxyUpdated(Contracts.CURRENCY_CONTROLLER, proxyAddress, newAddress, oldAddress);
        }
    }
}
