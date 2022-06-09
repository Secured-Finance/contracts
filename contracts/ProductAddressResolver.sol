// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IProductAddressResolver.sol";
import "./libraries/DealId.sol";
import "./utils/Ownable.sol";
import {ProductAddressResolverStorage as Storage} from "./storages/ProductAddressResolverStorage.sol";

/**
 * @title ProductAddressResolver contract is used to store addresses for each product
 * type supported on the protocol. Addresses stored per bytes4 prefixes which
 * are a simple identifiers of the product type
 */
contract ProductAddressResolver is IProductAddressResolver, Ownable, Initializable {
    using Address for address;

    /**
     * @dev Modifier to check if passed prefix is valid
     */
    modifier validPrefix(bytes4 _prefix) {
        require(Storage.slot().productContracts[_prefix] != address(0), "INVALID_ADDRESS");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address owner) public initializer {
        _transferOwnership(owner);
    }

    /**
     * @dev Triggers to register new product type in a address resolver
     * @param _prefix Bytes4 prefix for product type
     * @param _product Product contract address
     * @param _controller Controller contract address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving contract which is not supporting a common interface
     */
    function registerProduct(
        bytes4 _prefix,
        address _product,
        address _controller
    ) public override onlyOwner {
        require(_product.isContract(), "Can't add non-contract address");
        require(_controller.isContract(), "Can't add non-contract address");

        address prevProduct = Storage.slot().productContracts[_prefix];
        Storage.slot().productContracts[_prefix] = _product;
        Storage.slot().controllerContracts[_prefix] = _controller;

        Storage.slot().productPrefix[prevProduct] = "";
        Storage.slot().productPrefix[_product] = _prefix;

        emit RegisterProduct(_prefix, _product, _controller);
    }

    /**
     * @dev Triggers to register several product types in a address resolver
     * @param _prefixes Array of Bytes4 prefixes for each product type
     * @param _contracts Array of smart contract addresses for each product
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving contract which is not supporting common interface
     */
    function registerProducts(
        bytes4[] calldata _prefixes,
        address[] calldata _contracts,
        address[] calldata _controllers
    ) public override onlyOwner {
        require(_prefixes.length == _contracts.length, "Invalid input lengths");

        for (uint256 i = 0; i < _prefixes.length; i++) {
            bytes4 prefix = _prefixes[i];
            address product = _contracts[i];
            address controller = _controllers[i];
            registerProduct(prefix, product, controller);
        }
    }

    /**
     * @dev Triggers to get product address by short prefix.
     * @param _prefix Bytes4 prefix for product type
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContract(bytes4 _prefix) public view override returns (address) {
        return Storage.slot().productContracts[_prefix];
    }

    /**
     * @dev Triggers to get product address by deal id
     * @param _dealId Product deal idenfitier
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContractByDealId(bytes32 _dealId) public view override returns (address) {
        bytes4 prefix = DealId.getPrefix(_dealId);
        return Storage.slot().productContracts[prefix];
    }

    /**
     * @dev Triggers to get market controller address by short prefix.
     * @param _prefix Bytes4 prefix for product type
     * @notice To work with the contract this address should be wrapped around IYieldCurve interface
     */
    function getControllerContract(bytes4 _prefix) public view override returns (address) {
        return Storage.slot().controllerContracts[_prefix];
    }

    /**
     * @dev Triggers to get market controller address by deal id
     * @param _dealId Product deal idenfitier
     * @notice To work with the contract this address should be wrapped around IYieldCurve interface
     */
    function getControllerContractByDealId(bytes32 _dealId) public view override returns (address) {
        bytes4 prefix = DealId.getPrefix(_dealId);
        return Storage.slot().controllerContracts[prefix];
    }

    /**
     * @dev Triggers to verify if a specific product is supported by short prefix.
     * @param _prefix Bytes4 prefix for product type
     */
    function isSupportedProduct(bytes4 _prefix) public view override returns (bool) {
        return Storage.slot().productContracts[_prefix] != address(0);
    }

    /**
     * @dev Triggers to verify if a specific product is supported by deal id.
     * @param _dealId Product deal idenfitier
     */
    function isSupportedProductByDealId(bytes32 _dealId) public view override returns (bool) {
        bytes4 prefix = DealId.getPrefix(_dealId);
        return Storage.slot().productContracts[prefix] != address(0);
    }

    /**
     * @dev Triggers to verify if a specific product contract is registered.
     * @param _product Product contract address
     */
    function isRegisteredProductContract(address _product) public view override returns (bool) {
        return Storage.slot().productPrefix[_product] != "";
    }
}
