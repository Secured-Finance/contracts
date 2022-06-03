// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IMarkToMarket {
    function updatePV(bytes32 dealId) external;

    function updatePVs(bytes32[] memory dealIds) external;
}
