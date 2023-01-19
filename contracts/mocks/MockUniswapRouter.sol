// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
// libraries
import {Contracts} from "../libraries/Contracts.sol";
import {ERC20Handler} from "../libraries/ERC20Handler.sol";
// mixins
import {MixinAddressResolver} from "../mixins/MixinAddressResolver.sol";

contract MockUniswapRouter is MixinAddressResolver {
    mapping(address => bytes32) private currencies;

    constructor(address _resolver, address _WETH9) {
        registerAddressResolver(_resolver);
        ERC20Handler.initialize(_WETH9);

        buildCache();
    }

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
        uint256 amountOutInETH = currencyController().convertToETH(
            currencies[params.tokenOut],
            params.amountOut
        );

        amountIn = currencyController().convertFromETH(currencies[params.tokenIn], amountOutInETH);

        require(amountIn <= params.amountInMaximum, "Too much requested");

        ERC20Handler.safeTransferFrom(params.tokenIn, msg.sender, address(this), amountIn);
        ERC20Handler.safeTransfer(params.tokenOut, msg.sender, params.amountOut);
    }
}
