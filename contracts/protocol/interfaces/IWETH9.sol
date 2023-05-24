// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../dependencies/openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWETH9 is IERC20 {
    event Deposit(address user, uint256 amount);
    event Withdrawal(address user, uint256 amount);

    function deposit() external payable;

    function withdraw(uint256 amount) external;
}
