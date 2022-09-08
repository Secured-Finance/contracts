// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBeaconProxyController {
    event BeaconProxyCreated(
        bytes32 indexed id,
        address indexed proxyAddress,
        address indexed implementationAddress
    );

    event BeaconProxyUpdated(
        bytes32 indexed id,
        address indexed proxyAddress,
        address indexed newImplementationAddress,
        address oldImplementationAddress
    );

    function getBeaconProxyAddress(bytes32 beaconName) external view returns (address);

    function setLendingMarketImpl(address newImpl) external;

    function deployLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _maturity
    ) external returns (address market);
}
