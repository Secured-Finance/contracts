// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IReserveFund {
    function deposit(bytes32 ccy, uint256 amount) external payable;

    function withdraw(bytes32 ccy, uint256 amount) external;
}
