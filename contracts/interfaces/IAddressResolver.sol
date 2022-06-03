// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAddressResolver {
    event AddressImported(bytes32 name, address destination);

    function getAddress(bytes32 name, string calldata reason) external view returns (address);

    function getAddress(bytes32 name) external view returns (address);
}
