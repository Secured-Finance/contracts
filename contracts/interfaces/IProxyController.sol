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

    function getRegisteredProxies() external view returns (address[] memory);

    function getRegisteredContractNames() external view returns (bytes32[] memory);
}
