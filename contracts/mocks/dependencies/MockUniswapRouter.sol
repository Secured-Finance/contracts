// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
// libraries
import {Contracts} from "../../protocol/libraries/Contracts.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
// mixins
import {MixinAddressResolver} from "../../protocol/mixins/MixinAddressResolver.sol";

contract MockUniswapRouter is MixinAddressResolver {
    mapping(address => bytes32) private currencies;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        _;
    }

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

    // V3 functions
    function exactOutputSingle(
        ISwapRouter.ExactOutputSingleParams calldata params
    ) external returns (uint256 amountIn) {
        amountIn = currencyController().convert(
            currencies[params.tokenOut],
            currencies[params.tokenIn],
            params.amountOut
        );

        require(amountIn <= params.amountInMaximum, "Too much requested");

        TransferHelper.safeTransferFrom(params.tokenIn, msg.sender, address(this), amountIn);
        TransferHelper.safeTransfer(params.tokenOut, msg.sender, params.amountOut);
    }

    function exactInputSingle(
        ISwapRouter.ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
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

    // V2 functions
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(TransferHelper.isNative(path[1]), "UniswapV2Router: INVALID_PATH");

        amounts = new uint256[](1);
        amounts[0] = currencyController().convert(
            currencies[path[0]],
            currencies[path[1]],
            amountIn
        );

        require(amounts[0] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

        TransferHelper.safeTransferETH(to, amounts[0]);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = new uint256[](1);
        amounts[0] = currencyController().convert(
            currencies[path[0]],
            currencies[path[1]],
            amountIn
        );

        require(amounts[0] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

        TransferHelper.safeTransfer(path[1], to, amounts[0]);
    }

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable ensure(deadline) returns (uint[] memory amounts) {
        require(TransferHelper.isNative(path[0]), "UniswapV2Router: INVALID_PATH");

        amounts = new uint256[](1);
        amounts[0] = currencyController().convert(
            currencies[path[0]],
            currencies[path[1]],
            msg.value
        );

        require(amounts[0] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

        TransferHelper.safeTransfer(path[1], to, amounts[0]);
    }
}
