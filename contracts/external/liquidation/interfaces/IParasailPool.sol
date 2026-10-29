// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IParasailPool {
    /**
     * @notice Withdraws native FIL by redeeming pFIL from the caller.
     * @param amount The amount of pFIL to redeem
     */
    function withdrawFIL(uint256 amount) external;
}
