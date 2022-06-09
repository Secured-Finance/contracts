// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ILiquidations {
    event DealAddedToLiquidationQueue(address party0, address party1, bytes32 dealId);
    event DealRemovedFromLiquidationQueue(address party0, address party1, bytes32 dealId);
    event LiquidationAgentAdded(address indexed liquidationAgent);
    event LiquidationAgentRemoved(address indexed liquidationAgent);
    event OffsetUpdated(uint256 oldOffset, uint256 newOffset);

    function addDealToLiquidationQueue(
        address party0,
        address party1,
        bytes32 dealId
    ) external;

    function addLiquidationAgent(address _liquidationAgent) external;

    function liquidateDeals(
        address party0,
        address party1,
        bytes32[] memory dealIds
    ) external;

    function liquidateDeals(address party0, address party1) external;

    function getOffset() external view returns (uint256);

    function removeDealFromLiquidationQueue(
        address party0,
        address party1,
        bytes32 dealId
    ) external;

    function removeLiquidationAgent(address _liquidationAgent) external;

    function updateLiquidationOffset(uint256 _offset) external;
}
