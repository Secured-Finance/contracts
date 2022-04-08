// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract MarkToMarketMock {
    function updatePV(bytes32 dealId) public pure {
        return;
    }

    function updatePVs(bytes32[] memory dealIds) public pure {
        return;
    }
}
