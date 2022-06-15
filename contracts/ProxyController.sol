// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAddressResolver.sol";
import "./interfaces/IProxyController.sol";
import "./interfaces/IProductAddressResolver.sol";
import "./libraries/Contracts.sol";
import "./libraries/ProductPrefixes.sol";
import "./utils/UpgradeabilityProxy.sol";

contract ProxyController is IProxyController, Ownable {
    IAddressResolver private resolver;

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) Ownable() {
        resolver = IAddressResolver(_resolver);
    }

    /**
     * @dev Gets the proxy address to specified name
     * @param name The cache name of the contract
     */
    function getProxyAddress(bytes32 name) public view returns (address) {
        address proxyAddress = resolver.getAddress(name, "Address not found");
        UpgradeabilityProxy proxy = UpgradeabilityProxy(payable(proxyAddress));

        require(proxy.implementation() != address(0), "Proxy address not found");

        return proxyAddress;
    }

    /**
     * @dev Gets the product proxy address to specified prefix
     * @param prefix Bytes4 prefix for product type
     */
    function getProductProxyAddress(bytes4 prefix) external view returns (address) {
        address productAddressResolverAddress = resolver.getAddress(
            Contracts.PRODUCT_ADDRESS_RESOLVER,
            "Address not found"
        );
        IProductAddressResolver productAddressResolver = IProductAddressResolver(
            productAddressResolverAddress
        );
        address proxyAddress = productAddressResolver.getProductContract(prefix);
        UpgradeabilityProxy proxy = UpgradeabilityProxy(payable(proxyAddress));

        require(proxy.implementation() != address(0), "Proxy address not found");

        return proxyAddress;
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
     * @dev Sets the implementation contract of Loan product
     * @param newImpl The address of implementation contract
     */
    function setLoanImpl(address newImpl) external onlyOwner {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            msg.sender,
            resolver
        );
        _updateImpl(ProductPrefixes.LOAN, newImpl, data);
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

            emit ProxyCreated(name, address(proxy), newAddress);
        } else {
            proxy = UpgradeabilityProxy(payable(proxyAddress));
            address oldAddress = proxy.implementation();
            proxy.upgradeTo(newAddress);
            emit ProxyUpdated(name, proxyAddress, newAddress, oldAddress);
        }
    }
}
