// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
// libraries
import {Contracts} from "../libraries/Contracts.sol";
import {ERC20Handler} from "../libraries/ERC20Handler.sol";
// mixins
import {MixinAddressResolver} from "../mixins/MixinAddressResolver.sol";

contract MockUniswapQuoter is MixinAddressResolver {
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

    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external view returns (uint256 amountOut) {
        uint256 amountInInETH = currencyController().convertToETH(currencies[tokenIn], amountIn);

        // NOTE: This fee and sqrtPriceLimitX96 are not intended to be used like this,
        // but are used here to adjust the amountOut value for testing purposes.
        amountOut =
            currencyController().convertFromETH(currencies[tokenOut], amountInInETH) -
            fee +
            sqrtPriceLimitX96;
    }
}
