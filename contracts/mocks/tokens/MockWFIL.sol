// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.19;
import {MockERC20} from "./MockERC20.sol";

contract MockWFIL is MockERC20 {
    string private _name = "Ethereum Wrapped Filecoin";
    string private _symbol = "WFIL";

    constructor(uint256 initialBalance) payable MockERC20(_name, _symbol, initialBalance) {}
}
