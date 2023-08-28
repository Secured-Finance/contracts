// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "../../dependencies/uniswap/ISwapRouter.sol";
// libraries
import {Contracts} from "../../protocol/libraries/Contracts.sol";
import {ERC20Handler} from "../../protocol/libraries/ERC20Handler.sol";
// mixins
import {MixinAddressResolver} from "../../protocol/mixins/MixinAddressResolver.sol";

contract MockUniswapRouter is MixinAddressResolver {
    mapping(address => bytes32) private currencies;

    constructor(address _resolver, address _WETH9) {
        registerAddressResolver(_resolver);
        ERC20Handler.initialize(_WETH9);

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

        ERC20Handler.safeTransferFrom(params.tokenIn, msg.sender, address(this), amountIn);
        ERC20Handler.safeTransfer(params.tokenOut, msg.sender, params.amountOut);
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

        if (!ERC20Handler.isNative(params.tokenIn)) {
            ERC20Handler.safeTransferFrom(
                params.tokenIn,
                msg.sender,
                address(this),
                params.amountIn
            );
        }

        if (!ERC20Handler.isNative(params.tokenOut)) {
            ERC20Handler.safeTransfer(params.tokenOut, msg.sender, amountOut);
        } else {
            ERC20Handler.safeTransferETH(msg.sender, amountOut);
        }
    }
}
