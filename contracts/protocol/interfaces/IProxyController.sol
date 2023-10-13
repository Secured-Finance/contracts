// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IProxyController {
    error InvalidProxyContract();

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
}
