// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface ISwapExecutor {
    /**
     * @notice Returns whether this executor has an enabled route for a token pair.
     */
    function supportsPair(address tokenIn, address tokenOut) external view returns (bool);

    /**
     * @notice Swaps an exact input amount and sends the output to the recipient.
     * @dev Native input is supplied as msg.value while tokenIn remains the wrapped-native address.
     *      Native output is unwrapped before it is sent to the recipient.
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient
    ) external payable returns (uint256 amountOut);
}
