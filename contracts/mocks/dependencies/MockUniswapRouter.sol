// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "../../dependencies/uniswap/ISwapRouter.sol";
// libraries
import {Contracts} from "../../protocol/libraries/Contracts.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
// mixins
import {MixinAddressResolver} from "../../protocol/mixins/MixinAddressResolver.sol";

contract MockUniswapRouter is MixinAddressResolver {
    mapping(address => bytes32) private currencies;

    constructor(address _resolver, address _nativeToken) {
        registerAddressResolver(_resolver);
        TransferHelper.initialize(_nativeToken);

        buildCache();
    }

    receive() external payable {}

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
    }

    function setToken(bytes32 ccy, address token) external {
        currencies[token] = ccy;
    }

    function exactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata params)
        external
        returns (uint256 amountIn)
    {
        amountIn = currencyController().convert(
            currencies[params.tokenOut],
            currencies[params.tokenIn],
            params.amountOut
        );

        require(amountIn <= params.amountInMaximum, "Too much requested");

        TransferHelper.safeTransferFrom(params.tokenIn, msg.sender, address(this), amountIn);
        TransferHelper.safeTransfer(params.tokenOut, msg.sender, params.amountOut);
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        amountOut = currencyController().convert(
            currencies[params.tokenIn],
            currencies[params.tokenOut],
            params.amountIn
        );

        require(amountOut >= params.amountOutMinimum, "Too little received");

        if (!TransferHelper.isNative(params.tokenIn)) {
            TransferHelper.safeTransferFrom(
                params.tokenIn,
                msg.sender,
                address(this),
                params.amountIn
            );
        }

        if (!TransferHelper.isNative(params.tokenOut)) {
            TransferHelper.safeTransfer(params.tokenOut, msg.sender, amountOut);
        } else {
            TransferHelper.safeTransferETH(msg.sender, amountOut);
        }
    }
}
