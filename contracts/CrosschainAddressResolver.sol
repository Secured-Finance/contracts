// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interfaces/ICrosschainAddressResolver.sol";
import "./mixins/MixinAddressResolver.sol";
import {CrosschainAddressResolverStorage as Storage} from "./storages/CrosschainAddressResolverStorage.sol";

contract CrosschainAddressResolver is
    ICrosschainAddressResolver,
    MixinAddressResolver,
    Initializable
{
    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address resolver) public initializer {
        registerAddressResolver(resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
    }

    /**
     * @dev Triggers to register multiple cross-chain addresses per chainId for user
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
    ) public override onlyAcceptedContracts {
        require(_chainIds.length == _addresses.length, "Invalid input lengths");

        for (uint256 i = 0; i < _chainIds.length; i++) {
            _updateAddress(_user, _chainIds[i], _addresses[i]);
        }
    }

    /**
     * @dev Triggers to register cross-chain address per chainId by user
     * @param _chainId Chain ID number
     * @param _address Target blockchain address
     *
     * @notice This function triggers by the user, and stores addresses for `msg.sender`
     *
     */
    function updateAddress(uint256 _chainId, string memory _address) public override {
        _updateAddress(msg.sender, _chainId, _address);
    }

    /**
     * @dev Triggers to register cross-chain address per chainId by user
     * @param _user Secured Finance user ETH address
     * @param _chainId Chain ID number
     * @param _address Target blockchain address
     *
     * @notice This function triggers by the Collateral Aggregator while user is registered in a system
     *
     */
    function updateAddress(
        address _user,
        uint256 _chainId,
        string memory _address
    ) public override onlyAcceptedContracts {
        _updateAddress(_user, _chainId, _address);
    }

    /**
     * @dev Triggers to get target blockchain address for a specific user.
     * @param _user Ethereum address of the Secured Finance user
     * @param _user Chain ID number
     */
    function getUserAddress(address _user, uint256 _chainId)
        public
        view
        override
        returns (string memory)
    {
        return Storage.slot().crosschainAddreses[_user][_chainId];
    }

    /**
     * @dev Internal function to store cross-chain addresses for user by chainID
     * @param _user Secured Finance user ETH address
     * @param _chainId Chain ID number
     * @param _address Target blockchain address
     *
     */
    function _updateAddress(
        address _user,
        uint256 _chainId,
        string memory _address
    ) internal {
        Storage.slot().crosschainAddreses[_user][_chainId] = _address;
        emit UpdateAddress(_user, _chainId, _address);
    }
}
