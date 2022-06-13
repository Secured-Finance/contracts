// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IProxyController.sol";
import "./libraries/Contracts.sol";
import "./utils/UpgradeabilityProxy.sol";

contract ProxyController is IProxyController, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // Map of registered addresses (name => registeredAddresses)
    mapping(bytes32 => address) private _registeredProxies;
    EnumerableSet.AddressSet private _registeredProxySet;
    EnumerableSet.Bytes32Set private _registeredContractNameSet;

    IAddressResolver private resolver;

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) Ownable() {
        resolver = IAddressResolver(_resolver);
    }

    /**
     * @dev Gets registered proxy addresses
     */
    function getRegisteredProxies() external view returns (address[] memory) {
        return _registeredProxySet.values();
    }

    /**
     * @dev Gets registered contract names
     */
    function getRegisteredContractNames() external view returns (bytes32[] memory) {
        return _registeredContractNameSet.values();
    }

    /**
     * @dev Gets the proxy address to specified name
     * @param name The cache name of the contract
     */
    function getProxyAddress(bytes32 name) external view returns (address) {
        return _registeredProxies[name];
    }

    /**
     * @dev Sets the implementation contract of CloseOutNetting
     * @param newImpl The address of implementation contract
     */
    function setCloseOutNettingImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.CLOSE_OUT_NETTING, newImpl, data);
    }

    /**
     * @dev  Sets the implementation contract of CollateralAggregator
     * @param newImpl The address of implementation contract
     */
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

    /**
     * @dev Sets the implementation contract of CrosschainAddressResolver
     * @param newImpl The address of implementation contract
     */
    function setCrosschainAddressResolverImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.CROSSCHAIN_ADDRESS_RESOLVER, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of CurrencyController
     * @param newImpl The address of implementation contract
     */
    function setCurrencyControllerImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        _updateImpl(Contracts.CURRENCY_CONTROLLER, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of LendingMarketController
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketControllerImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            msg.sender,
            resolver
        );
        _updateImpl(Contracts.LENDING_MARKET_CONTROLLER, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of Liquidations
     * @param newImpl The address of implementation contract
     */
    function setLiquidationsImpl(address newImpl, uint256 offset) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint256)",
            msg.sender,
            resolver,
            offset
        );
        _updateImpl(Contracts.LIQUIDATIONS, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of MarkToMarket
     * @param newImpl The address of implementation contract
     */
    function setMarkToMarketImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.MARK_TO_MARKET, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of PaymentAggregator
     * @param newImpl The address of implementation contract
     */
    function setPaymentAggregatorImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", resolver);
        _updateImpl(Contracts.PAYMENT_AGGREGATOR, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of ProductAddressResolver
     * @param newImpl The address of implementation contract
     */
    function setProductAddressResolverImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature("initialize(address)", msg.sender);
        _updateImpl(Contracts.PRODUCT_ADDRESS_RESOLVER, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of SettlementEngine
     * @param newImpl The address of implementation contract
     */
    function setSettlementEngineImpl(address newImpl, address _WETH9) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,address)",
            msg.sender,
            resolver,
            _WETH9
        );
        _updateImpl(Contracts.SETTLEMENT_ENGINE, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of TermStructure
     * @param newImpl The address of implementation contract
     */
    function setTermStructureImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            msg.sender,
            resolver
        );
        _updateImpl(Contracts.TERM_STRUCTURE, newImpl, data);
    }

    /**
     * @dev Sets the implementation contract of specified contract
     * The first time the contract address is set, `UpgradeabilityProxy` is created.
     * From the second time, the contract address set in the created `UpgradeabilityProxy`
     * will be updated.
     *
     * @param name The cache name of the contract
     * @param newAddress The address of implementation contract
     * @param data the data in a delegate call to a specified function
     */
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
