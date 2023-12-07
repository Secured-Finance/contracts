// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";

interface INativeToken is IERC20 {
    event Deposit(address user, uint256 amount);
    event Withdrawal(address user, uint256 amount);

    function deposit() external payable;

    function withdraw(uint256 amount) external;
}
