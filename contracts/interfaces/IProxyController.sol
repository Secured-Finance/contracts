// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IProxyController {
    event ProxyCreated(
        bytes32 indexed id,
        address indexed proxyAddress,
        address indexed implementationAddress
    );

    event ProxyUpdated(
        bytes32 indexed id,
        address indexed proxyAddress,
        address indexed newImplementationAddress,
        address oldImplementationAddress
    );

    function registeredProxies() external view returns (address[] memory);

    function registeredContractNames() external view returns (bytes32[] memory);
}
