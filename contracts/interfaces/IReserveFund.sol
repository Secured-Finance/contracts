// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IReserveFund {
    function deposit(bytes32 _ccy, uint256 _amount) external payable;
}
