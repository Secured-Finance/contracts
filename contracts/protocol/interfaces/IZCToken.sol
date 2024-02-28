// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IERC20} from "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";

interface IZCToken is IERC20 {
    function asset() external view returns (address);

    function maturity() external view returns (uint256);

    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;
}
