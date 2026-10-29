// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
import {IMockERC20} from "../tokens/IMockERC20.sol";

contract MockParasailPool {
    IMockERC20 public immutable pFIL;

    constructor(address _pFIL) {
        pFIL = IMockERC20(_pFIL);
    }

    receive() external payable {}

    function withdrawFIL(uint256 _amount) external {
        pFIL.burn(msg.sender, _amount);
        TransferHelper.safeTransferETH(msg.sender, _amount);
    }
}
