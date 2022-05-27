// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../mixins/MixinAddressResolver.sol";

contract MigrationAddressResolver {
    function buildCaches(address[] calldata _addresses) external {
        for (uint256 i = 0; i < _addresses.length; i++) {
            MixinAddressResolver destination = MixinAddressResolver(
                _addresses[i]
            );
            if (!destination.isResolverCached()) {
                destination.buildCache();
            }
        }
    }
}
