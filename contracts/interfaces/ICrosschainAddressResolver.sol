// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface ICrosschainAddressResolver {
    event UpdateAddress(address _user, uint256 _chainId, string _address);

    /**
     * @dev Trigers to register multiple cross-chain addresses per chainId for user
     * @param _user Secured Finance user ETH address
     * @param _chainIds Array of chain ID number
     * @param _addresses Array of the target blockchain addresses
     *
     * @notice This function triggers by the Collateral Aggregator while user is registered in a system
     *
     */
    function updateAddresses(
        address _user,
        uint256[] memory _chainIds,
        string[] memory _addresses
    ) external;

    /**
     * @dev Trigers to register cross-chain address per chainId by user
     * @param _chainId Chain ID number
     * @param _address Target blockchain address
     *
     */
    function updateAddress(uint256 _chainId, string memory _address) external;

    /**
     * @dev Trigers to register cross-chain address per chainId by user
     * @param _user Secured Finance user ETH address
     * @param _chainId Chain ID number
     * @param _address Target blockchain address
     *
     */
    function updateAddress(
        address _user,
        uint256 _chainId,
        string memory _address
    ) external;

    /**
     * @dev Trigers to get target blockchain address for a specific user.
     * @param _user Ethereum address of the Secured Finance user
     * @param _user Chain ID number
     */
    function getUserAddress(address _user, uint256 _chainId)
        external
        view
        returns (string memory);
}
