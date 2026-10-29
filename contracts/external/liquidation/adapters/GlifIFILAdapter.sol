// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IERC20} from "../../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {INativeToken} from "../../../protocol/interfaces/INativeToken.sol";
import {TransferHelper} from "../../../protocol/libraries/TransferHelper.sol";
import {IInfinityPool} from "../../oracles/interfaces/IInfinityPool.sol";
import {IConversionAdapter} from "../interfaces/IConversionAdapter.sol";

contract GlifIFILAdapter is IConversionAdapter {
    error InvalidAddress();
    error InvalidInputAmount(uint256 expected, uint256 actual);

    IInfinityPool public immutable pool;
    address public immutable override tokenIn;
    address public immutable override tokenOut;

    constructor(address _pool, address _iFIL, address _wFIL) {
        if (_pool == address(0) || _iFIL == address(0) || _wFIL == address(0)) {
            revert InvalidAddress();
        }

        pool = IInfinityPool(_pool);
        tokenIn = _iFIL;
        tokenOut = _wFIL;
    }

    /**
     * @notice Receives native FIL redeemed by the Infinity Pool.
     */
    receive() external payable {}

    /**
     * @notice Estimates the amount of wrapped FIL received for an iFIL conversion.
     * @param _amountIn The amount of iFIL to convert
     * @return The estimated amount of wrapped FIL
     */
    function previewConvert(uint256 _amountIn) external view override returns (uint256) {
        return pool.convertToAssets(_amountIn);
    }

    /**
     * @notice Converts iFIL into wrapped FIL and sends it to the caller.
     * @dev Native FIL returned by the Infinity Pool is wrapped before being sent.
     * @param _amountIn The amount of iFIL to convert
     * @return amountOut The amount of wrapped FIL sent to the caller
     */
    function convert(uint256 _amountIn) external override returns (uint256 amountOut) {
        uint256 inputBalanceBefore = IERC20(tokenIn).balanceOf(address(this));
        TransferHelper.safeTransferFrom(tokenIn, msg.sender, address(this), _amountIn);
        uint256 receivedInputAmount = IERC20(tokenIn).balanceOf(address(this)) - inputBalanceBefore;

        if (receivedInputAmount != _amountIn) {
            revert InvalidInputAmount(_amountIn, receivedInputAmount);
        }

        uint256 nativeBalanceBefore = address(this).balance;
        uint256 wrappedBalanceBefore = IERC20(tokenOut).balanceOf(address(this));

        pool.redeem(_amountIn, address(this), address(this));

        uint256 receivedNativeAmount = address(this).balance - nativeBalanceBefore;
        uint256 receivedWrappedAmount = IERC20(tokenOut).balanceOf(address(this)) -
            wrappedBalanceBefore;

        if (receivedNativeAmount != 0) {
            INativeToken(tokenOut).deposit{value: receivedNativeAmount}();
        }

        amountOut = receivedNativeAmount + receivedWrappedAmount;
        TransferHelper.safeTransfer(tokenOut, msg.sender, amountOut);
    }
}
