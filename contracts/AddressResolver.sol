// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IAddressResolver} from "./interfaces/IAddressResolver.sol";
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
import {AddressResolverStorage as Storage} from "./storages/AddressResolverStorage.sol";

contract AddressResolver is IAddressResolver, Ownable, Proxyable {
    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address owner) public initializer onlyProxy {
        _transferOwnership(owner);
    }

    function importAddresses(bytes32[] memory _names, address[] memory _addresses)
        public
        onlyOwner
    {
        require(_names.length == _addresses.length, "Input lengths must match");

        Storage.slot().addressCaches = _addresses;

        for (uint256 i = 0; i < _names.length; i++) {
            bytes32 name = _names[i];
            address destination = _addresses[i];
            Storage.slot().addresses[name] = destination;
            emit AddressImported(name, destination);
        }
    }

    function areAddressesImported(bytes32[] calldata _names, address[] calldata _addresses)
        external
        view
        returns (bool)
    {
        for (uint256 i = 0; i < _names.length; i++) {
            if (Storage.slot().addresses[_names[i]] != _addresses[i]) {
                return false;
            }
        }
        return true;
    }

    function getAddress(bytes32 _name, string calldata _reason)
        external
        view
        override
        returns (address)
    {
        address _foundAddress = Storage.slot().addresses[_name];
        require(_foundAddress != address(0), _reason);
        return _foundAddress;
    }

    function getAddress(bytes32 _name) external view override returns (address) {
        return Storage.slot().addresses[_name];
    }

    function getAddresses() external view override returns (address[] memory) {
        return Storage.slot().addressCaches;
    }
}
