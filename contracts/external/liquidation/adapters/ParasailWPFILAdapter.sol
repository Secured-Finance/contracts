// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IERC20} from "../../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {INativeToken} from "../../../protocol/interfaces/INativeToken.sol";
import {TransferHelper} from "../../../protocol/libraries/TransferHelper.sol";
import {IWPFIL} from "../../oracles/interfaces/IWPFIL.sol";
import {IConversionAdapter} from "../interfaces/IConversionAdapter.sol";
import {IParasailPool} from "../interfaces/IParasailPool.sol";

contract ParasailWPFILAdapter is IConversionAdapter {
    error InvalidAddress();
    error InvalidInputAmount(uint256 expected, uint256 actual);

    IParasailPool public immutable pool;
    IERC20 public immutable pFIL;
    address public immutable override tokenIn;
    address public immutable override tokenOut;

    constructor(address _pool, address _wpFIL, address _pFIL, address _wFIL) {
        if (
            _pool == address(0) ||
            _wpFIL == address(0) ||
            _pFIL == address(0) ||
            _wFIL == address(0)
        ) {
            revert InvalidAddress();
        }

        pool = IParasailPool(_pool);
        pFIL = IERC20(_pFIL);
        tokenIn = _wpFIL;
        tokenOut = _wFIL;
    }

    /**
     * @notice Receives native FIL withdrawn from the Parasail pool.
     */
    receive() external payable {}

    /**
     * @notice Estimates the amount of wrapped FIL received for a wpFIL conversion.
     * @param _amountIn The amount of wpFIL to convert
     * @return The estimated amount of wrapped FIL
     */
    function previewConvert(uint256 _amountIn) external view override returns (uint256) {
        return IWPFIL(tokenIn).getPFILByWPFIL(_amountIn);
    }

    /**
     * @notice Converts wpFIL into wrapped FIL and sends it to the caller.
     * @dev wpFIL is first unwrapped into pFIL. The pFIL is then redeemed for native FIL
     * through the Parasail pool and normalized into wrapped FIL.
     * @param _amountIn The amount of wpFIL to convert
     * @return amountOut The amount of wrapped FIL sent to the caller
     */
    function convert(uint256 _amountIn) external override returns (uint256 amountOut) {
        uint256 inputBalanceBefore = IERC20(tokenIn).balanceOf(address(this));
        TransferHelper.safeTransferFrom(tokenIn, msg.sender, address(this), _amountIn);
        uint256 receivedInputAmount = IERC20(tokenIn).balanceOf(address(this)) - inputBalanceBefore;

        if (receivedInputAmount != _amountIn) {
            revert InvalidInputAmount(_amountIn, receivedInputAmount);
        }

        uint256 pFILBalanceBefore = pFIL.balanceOf(address(this));
        IWPFIL(tokenIn).unwrap(_amountIn);
        uint256 receivedPFILAmount = pFIL.balanceOf(address(this)) - pFILBalanceBefore;

        uint256 nativeBalanceBefore = address(this).balance;
        pool.withdrawFIL(receivedPFILAmount);
        uint256 receivedNativeAmount = address(this).balance - nativeBalanceBefore;

        if (receivedNativeAmount != 0) {
            INativeToken(tokenOut).deposit{value: receivedNativeAmount}();
        }

        amountOut = receivedNativeAmount;
        TransferHelper.safeTransfer(tokenOut, msg.sender, amountOut);
    }
}
