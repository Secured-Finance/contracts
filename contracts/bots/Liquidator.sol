// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";

// libraries
import {ERC20Handler} from "../libraries/ERC20Handler.sol";
// interfaces
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../interfaces/ITokenVault.sol";
import {ILiquidator} from "../interfaces/ILiquidator.sol";

contract Liquidator is ILiquidator {
    ILendingMarketController internal lendingMarketController;
    ITokenVault internal tokenVault;
    ISwapRouter internal uniswapRouter;
    IQuoter internal uniswapQuoter;
    uint24 internal poolFee;

    constructor(
        address _lendingMarketController,
        address _tokenVault,
        address _uniswapRouter,
        address _uniswapQuoter
    ) {
        lendingMarketController = ILendingMarketController(_lendingMarketController);
        tokenVault = ITokenVault(_tokenVault);
        uniswapRouter = ISwapRouter(_uniswapRouter);
        uniswapQuoter = IQuoter(_uniswapQuoter);
    }

    receive() external payable {}

    function executeLiquidation(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) external {
        poolFee = _poolFee;
        lendingMarketController.executeLiquidationCall(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user
        );
    }

    function executeOperation(
        address liquidator,
        address user,
        bytes32 collateralCcy,
        uint256 receivedCollateralAmount,
        bytes32 debtCcy,
        uint256 debtMaturity,
        uint256 receivedDebtAmount,
        address initiator
    ) external override returns (bool) {
        address collateralCcyAddr = tokenVault.getTokenAddress(collateralCcy);
        address debtCcyAddr = tokenVault.getTokenAddress(debtCcy);

        tokenVault.withdraw(collateralCcy, receivedCollateralAmount);

        uint256 amountOut = _executeSwap(
            collateralCcyAddr,
            debtCcyAddr,
            receivedCollateralAmount,
            0,
            poolFee
        );

        ERC20Handler.safeApprove(debtCcyAddr, address(tokenVault), amountOut);

        tokenVault.deposit(debtCcy, amountOut);

        if (lendingMarketController.getFutureValue(debtCcy, debtMaturity, address(this)) != 0) {
            lendingMarketController.unwindOrder(debtCcy, debtMaturity);
        }

        emit OperationExecute(
            liquidator,
            user,
            collateralCcy,
            receivedCollateralAmount,
            debtCcy,
            debtMaturity,
            receivedDebtAmount,
            initiator
        );

        return true;
    }

    function _executeSwap(
        address _ccyFrom,
        address _ccyTo,
        uint256 _amountIn,
        uint256 _amountOutMinimum,
        uint24 _poolFee
    ) internal returns (uint256) {
        if (ERC20Handler.weth() != _ccyFrom) {
            ERC20Handler.safeApprove(_ccyFrom, address(uniswapRouter), _amountIn);
        }

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: _ccyFrom,
            tokenOut: _ccyTo,
            fee: _poolFee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: _amountIn,
            amountOutMinimum: _amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        return uniswapRouter.exactInputSingle{value: _amountIn}(params);
    }
}
