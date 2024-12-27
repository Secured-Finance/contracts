// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IParasailAggregator {
    function getAggregatedPrice() external view returns (uint256);
}
