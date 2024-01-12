// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.19;
import {MockERC20} from "./MockERC20.sol";

contract MockWETH is MockERC20 {
    string private _name = "Wrapped Ether";
    string private _symbol = "WETH";

    constructor(uint256 initialBalance) payable MockERC20(_name, _symbol, initialBalance) {}
}
