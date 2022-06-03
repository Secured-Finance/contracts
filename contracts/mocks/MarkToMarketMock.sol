// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract MarkToMarketMock {
    function updatePV(bytes32 dealId) public pure {
        return;
    }

    function updatePVs(bytes32[] memory dealIds) public pure {
        return;
    }
}
