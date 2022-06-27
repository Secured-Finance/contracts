// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IProductAddressResolver {
    event RegisterProduct(bytes4 prefix, address indexed product, address indexed controller);

    /**
     * @dev Triggers to register new product type in a address resolver
     * @param _prefix Bytes4 prefix for product type
     * @param _contract Product contract address
     * @param _controller Market controller address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving contract which is not supporting a common interface
     */
    function registerProduct(
        bytes4 _prefix,
        address _contract,
        address _controller
    ) external;

    /**
     * @dev Triggers to register several product types in a address resolver
     * @param _prefixes Array of Bytes4 prefixes for each product type
     * @param _contracts Array of smart contract addresses for each product
     * @param _controllers Array of market controller addresses
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving contract which is not supporting common interface
     */
    function registerProducts(
        bytes4[] calldata _prefixes,
        address[] calldata _contracts,
        address[] calldata _controllers
    ) external;

    /**
     * @dev Triggers to get product address by short prefix.
     * @param _prefix Bytes4 prefix for product type
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContract(bytes4 _prefix) external view returns (address);

    /**
     * @dev Triggers to get product addresses
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContracts() external view returns (address[] memory);

    /**
     * @dev Triggers to get product address by deal id
     * @param _dealId Product deal idenfitier
     * @notice To work with the contract this address should be wrapped around IProduct interface
     */
    function getProductContractByDealId(bytes32 _dealId) external view returns (address);

    /**
     * @dev Triggers to get market controller address by short prefix.
     * @param _prefix Bytes4 prefix for product type
     * @notice To work with the contract this address should be wrapped around IYieldCurve interface
     */
    function getControllerContract(bytes4 _prefix) external view returns (address);

    /**
     * @dev Triggers to get market controller address by deal id
     * @param _dealId Product deal idenfitier
     * @notice To work with the contract this address should be wrapped around IYieldCurve interface
     */
    function getControllerContractByDealId(bytes32 _dealId) external view returns (address);

    /**
     * @dev Triggers to verify if a specific product is supported by short prefix.
     * @param _prefix Bytes4 prefix for product type
     */
    function isSupportedProduct(bytes4 _prefix) external view returns (bool);

    /**
     * @dev Triggers to verify if a specific product is supported by deal id.
     * @param _dealId Product deal idenfitier
     */
    function isSupportedProductByDealId(bytes32 _dealId) external view returns (bool);

    /**
     * @dev Triggers to verify if a specific product contract is registered.
     * @param _product Product contract address
     */
    function isRegisteredProductContract(address _product) external view returns (bool);
}
