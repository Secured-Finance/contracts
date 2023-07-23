// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IReserveFund {
    event Pause(address account);
    event Unpause(address account);
    event ExecuteTransaction(address from, address to, uint256 value, bytes data);

    function isPaused() external view returns (bool);

    function pause() external;

    function unpause() external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function withdraw(bytes32 ccy, uint256 amount) external;

    function executeTransaction(address payable to, bytes memory data) external payable;

    function executeEmergencySettlement() external;
}
