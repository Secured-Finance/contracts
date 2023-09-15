// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// libraries
import {Contracts} from "../../protocol/libraries/Contracts.sol";
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
// mixins
import {MixinAddressResolver} from "../../protocol/mixins/MixinAddressResolver.sol";

contract MockUniswapQuoter is MixinAddressResolver {
    mapping(address => bytes32) private currencies;

    constructor(address _resolver, address _nativeToken) {
        registerAddressResolver(_resolver);
        TransferHelper.initialize(_nativeToken);

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
        uint256 amountInBaseCurrency = currencyController().convertToBaseCurrency(
            currencies[tokenIn],
            amountIn
        );

        // NOTE: This fee and sqrtPriceLimitX96 are not intended to be used like this,
        // but are used here to adjust the amountOut value for testing purposes.
        amountOut =
            currencyController().convertFromBaseCurrency(
                currencies[tokenOut],
                amountInBaseCurrency
            ) -
            fee +
            sqrtPriceLimitX96;
    }
}
