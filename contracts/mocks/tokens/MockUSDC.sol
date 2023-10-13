// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;
import {MockERC20} from "./MockERC20.sol";

contract MockUSDC is MockERC20 {
    string private _name = "USD Coin";
    string private _symbol = "USDC";

    constructor(uint256 initialBalance) payable MockERC20(_name, _symbol, initialBalance) {}

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
