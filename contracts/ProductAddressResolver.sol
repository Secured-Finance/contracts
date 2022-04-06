// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IProductAddressResolver.sol";
import "./libraries/DealId.sol";

/**
 * @title ProductAddressResolver contract is used to store addresses for each product
 * type supported on the protocol. Addresses stored per bytes4 prefixes which
 * are a simple identifiers of the product type
 */
contract ProductAddressResolver is IProductAddressResolver {
    using Address for address;

    event RegisterProduct(
        bytes4 prefix,
        address indexed product,
        address indexed controller
    );

    address public owner;

    // Mapping for storing product contract addresses
    mapping(bytes4 => address) _productContracts;
    mapping(bytes4 => address) _controllerContracts;

    /**
     * @dev Modifier to check if passed prefix is valid
     */
    modifier validPrefix(bytes4 _prefix) {
        require(_productContracts[_prefix] != address(0), "INVALID_ADDRESS");
        _;
    }

    /**
     * @dev Modifier to make a function callable only by contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "INVALID_ACCESS");
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     */
    constructor() public {
        owner = msg.sender;
    }

    /**
     * @dev Trigers to register new product type in a address resolver
     * @param _prefix Bytes4 prefix for product type
     * @param _contract Product contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving contract which is not supporting a common interface
     */
    function registerProduct(
        bytes4 _prefix,
        address _contract,
        address _controller
    ) public override onlyOwner {
        require(_contract.isContract(), "Can't add non-contract address");
        require(_controller.isContract(), "Can't add non-contract address");
        _productContracts[_prefix] = _contract;
        _controllerContracts[_prefix] = _controller;
        emit RegisterProduct(_prefix, _contract, _controller);
    }

    /**
     * @dev Trigers to register several product types in a address resolver
     * @param _prefixes Array of Bytes4 prefixes for each product type
     * @param _contracts Array of smart contract addresses for each product
     *
     * @notice Trigers only be contract owner
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
            address addr = _contracts[i];
            require(addr.isContract(), "Can't add non-contract address");

            address controller = _controllers[i];
            require(controller.isContract(), "Can't add non-contract address");

            _productContracts[prefix] = addr;
            _controllerContracts[prefix] = controller;

            emit RegisterProduct(prefix, addr, controller);
        }
    }

    /**
     * @dev Trigers to get product address by short prefix.
     * @param _prefix Bytes4 prefix for product type
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContract(bytes4 _prefix)
        public
        view
        override
        returns (address)
    {
        return _productContracts[_prefix];
    }

    /**
     * @dev Trigers to get product address by deal id
     * @param _dealId Product deal idenfitier
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContractByDealId(bytes32 _dealId)
        public
        view
        override
        returns (address)
    {
        bytes4 prefix = DealId.getPrefix(_dealId);
        return _productContracts[prefix];
    }

    /**
     * @dev Trigers to get market controller address by short prefix.
     * @param _prefix Bytes4 prefix for product type
     * @notice To work with the contract this address should be wrapped around IYieldCurve interface
     */
    function getControllerContract(bytes4 _prefix)
        public
        view
        override
        returns (address)
    {
        return _controllerContracts[_prefix];
    }

    /**
     * @dev Trigers to get market controller address by deal id
     * @param _dealId Product deal idenfitier
     * @notice To work with the contract this address should be wrapped around IYieldCurve interface
     */
    function getControllerContractByDealId(bytes32 _dealId)
        public
        view
        override
        returns (address)
    {
        bytes4 prefix = DealId.getPrefix(_dealId);
        return _controllerContracts[prefix];
    }

    /**
     * @dev Triggers to verify if a specific product is supported by short prefix.
     * @param _prefix Bytes4 prefix for product type
     */
    function isSupportedProduct(bytes4 _prefix)
        public
        view
        override
        returns (bool)
    {
        return _productContracts[_prefix] != address(0);
    }

    /**
     * @dev Triggers to verify if a specific product is supported by deal id.
     * @param _dealId Product deal idenfitier
     */
    function isSupportedProductByDealId(bytes32 _dealId)
        public
        view
        override
        returns (bool)
    {
        bytes4 prefix = DealId.getPrefix(_dealId);
        return _productContracts[prefix] != address(0);
    }
}
