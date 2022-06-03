// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../mixins/MixinAddressResolver.sol";

contract MigrationAddressResolver {
    function buildCaches(address[] calldata _addresses) external {
        for (uint256 i = 0; i < _addresses.length; i++) {
            MixinAddressResolver destination = MixinAddressResolver(_addresses[i]);
            if (!destination.isResolverCached()) {
                destination.buildCache();
            }
        }
    }
}
