// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract MarkToMarketMock {
    function initialize(address resolver) public pure {
        return;
    }

    function buildCache() public pure {
        return;
    }

    function isResolverCached() external pure returns (bool) {
        return true;
    }

    function updatePV(bytes32 dealId) public pure {
        return;
    }

    function updatePVs(bytes32[] memory dealIds) public pure {
        return;
    }
}
