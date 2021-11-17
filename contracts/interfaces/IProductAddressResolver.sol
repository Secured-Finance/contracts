// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface IProductAddressResolver {
    
    event RegisterProduct(bytes4 prefix, address indexed product, address indexed controller);

    /**
    * @dev Trigers to register new product type in a address resolver
    * @param _prefix Bytes4 prefix for product type
    * @param _contract Product contract address
    * @param _controller Market controller address
    *
    * @notice Trigers only be contract owner
    * @notice Reverts on saving contract which is not supporting a common interface
    */
    function registerProduct(bytes4 _prefix, address _contract, address _controller) external;

    /**
    * @dev Trigers to register several product types in a address resolver
    * @param _prefixes Array of Bytes4 prefixes for each product type
    * @param _contracts Array of smart contract addresses for each product
    * @param _controllers Array of market controller addresses
    *
    * @notice Trigers only be contract owner
    * @notice Reverts on saving contract which is not supporting common interface
    */
    function registerProducts(bytes4[] calldata _prefixes, address[] calldata _contracts, address[] calldata _controllers) external;

    /**
    * @dev Trigers to get product address by short prefix
    * @notice To work with the contract this address should be wrapped around IProduct interface
    */
    function getProductContract(bytes4 _prefix) external view returns (address);

    /**
    * @dev Trigers to get market controller address by short prefix
    * @notice To work with the contract this address should be wrapped around IYieldCurve interface
    */
    function getControllerContract(bytes4 _prefix) external view returns (address);

}