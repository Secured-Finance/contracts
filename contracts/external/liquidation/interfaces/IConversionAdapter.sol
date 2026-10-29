// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IConversionAdapter {
    /**
     * @notice Gets the token accepted by this adapter.
     * @return The address of the input token
     */
    function tokenIn() external view returns (address);

    /**
     * @notice Gets the normalized ERC-20 token returned by this adapter.
     * @return The address of the output token
     */
    function tokenOut() external view returns (address);

    /**
     * @notice Estimates the output amount for a conversion.
     * @param amountIn The amount of the input token to convert
     * @return amountOut The estimated amount of the output token
     */
    function previewConvert(uint256 amountIn) external view returns (uint256 amountOut);

    /**
     * @notice Converts an input token into the normalized ERC-20 output token.
     * @dev The adapter pulls the input token from and sends the output token to the caller.
     * @param amountIn The amount of the input token to convert
     * @return amountOut The amount of the output token sent to the caller
     */
    function convert(uint256 amountIn) external returns (uint256 amountOut);
}
