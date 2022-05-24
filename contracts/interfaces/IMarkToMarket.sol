// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

interface IMarkToMarket {
    function updatePV(bytes32 dealId) external;

    function updatePVs(bytes32[] memory dealIds) external;
}
