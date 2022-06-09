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

    function getRegisteredProxies() external view returns (address[] memory) {
        return _registeredProxySet.values();
    }

    function getRegisteredContractNames() external view returns (bytes32[] memory) {
        return _registeredContractNameSet.values();
    }

    function getProxyAddress(bytes32 name) external view returns (address) {
        return _registeredProxies[name];
    }

    function setCloseOutNettingImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.CLOSE_OUT_NETTING, newImpl, data);
    }

    function setCollateralAggregatorImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint256,uint256,uint256,uint256)",
            msg.sender,
            resolver,
            15000,
            12500,
            12000,
            2500
        );
        _updateImpl(Contracts.COLLATERAL_AGGREGATOR, newImpl, data);
    }

    function setCrosschainAddressResolverImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.CROSSCHAIN_ADDRESS_RESOLVER, newImpl, data);
    }

    function setCurrencyControllerImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        _updateImpl(Contracts.CURRENCY_CONTROLLER, newImpl, data);
    }

    function setLendingMarketControllerImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            msg.sender,
            resolver
        );
        _updateImpl(Contracts.LENDING_MARKET_CONTROLLER, newImpl, data);
    }

    function setLiquidationsImpl(address newImpl, uint256 offset) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint256)",
            msg.sender,
            resolver,
            offset
        );
        _updateImpl(Contracts.LIQUIDATIONS, newImpl, data);
    }

    function setMarkToMarketImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.MARK_TO_MARKET, newImpl, data);
    }

    function setPaymentAggregatorImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.PAYMENT_AGGREGATOR, newImpl, data);
    }

    function setProductAddressResolverImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        _updateImpl(Contracts.PRODUCT_ADDRESS_RESOLVER, newImpl, data);
    }

    function setSettlementEngineImpl(address newImpl, address _WETH9) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,address)",
            msg.sender,
            resolver,
            _WETH9
        );
        _updateImpl(Contracts.SETTLEMENT_ENGINE, newImpl, data);
    }

    function setTermStructureImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            msg.sender,
            resolver
        );
        _updateImpl(Contracts.TERM_STRUCTURE, newImpl, data);
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
