// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.19;
import {MockERC20} from "./MockERC20.sol";

contract MockWBTC is MockERC20 {
    string private _name = "Wrapped BTC";
    string private _symbol = "WBTC";

    constructor(uint256 initialBalance) payable MockERC20(_name, _symbol, initialBalance) {}

    function decimals() public view virtual override returns (uint8) {
        return 8;
    }
}
