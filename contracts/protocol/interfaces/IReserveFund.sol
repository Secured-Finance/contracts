// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IReserveFund {
    event Pause(address account);
    event Unpause(address account);

    function isPaused() external view returns (bool);

    function pause() external;

    function unpause() external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function withdraw(bytes32 ccy, uint256 amount) external;

    function executeEmergencySettlement() external;
}
