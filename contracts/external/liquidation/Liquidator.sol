// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ISwapRouter as ISwapRouterV3} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IUniswapV2Router01 as ISwapRouterV2} from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import {IERC20} from "../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {Initializable} from "../../dependencies/openzeppelin/proxy/utils/Initializable.sol";

// libraries
import {TransferHelper} from "../../protocol/libraries/TransferHelper.sol";
// interfaces
import {ILendingMarketController} from "../../protocol/interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../../protocol/interfaces/ITokenVault.sol";
import {ILiquidationReceiver} from "../../protocol/interfaces/ILiquidationReceiver.sol";
// mixins
import {MixinAccessControl} from "../../protocol/mixins/MixinAccessControl.sol";
import {MixinWallet} from "../../protocol/mixins/MixinWallet.sol";

contract Liquidator is ILiquidationReceiver, MixinAccessControl, MixinWallet, Initializable {
    address public immutable nativeToken;
    ILendingMarketController public immutable lendingMarketController;
    ITokenVault public immutable tokenVault;

    address public uniswapRouter;
    uint24 public poolFee;
    uint256[] public collateralMaturities;

    modifier onlyLendingMarketController() {
        require(_msgSender() == address(lendingMarketController), "Invalid caller");
        _;
    }

    constructor(bytes32 _nativeToken, address _lendingMarketController, address _tokenVault) {
        lendingMarketController = ILendingMarketController(_lendingMarketController);
        tokenVault = ITokenVault(_tokenVault);
        nativeToken = tokenVault.getTokenAddress(_nativeToken);
        initialize();
    }

    function initialize() public initializer {
        MixinAccessControl._setupInitialRoles(msg.sender);
        MixinWallet._initialize(msg.sender, nativeToken);
    }

    receive() external payable {}

    /**
     * @notice Executes the liquidation call.
     * @dev In this liquidation call, Uniswap V2 is used for swapping when poolFee is 0.
     * Otherwise, Uniswap V3 is used.
     *
     * @param _collateralCcy Currency name of the collateral in bytes32
     * @param _collateralMaturities Maturities of the collateral
     * @param _debtCcy Currency name of the debt in bytes32
     * @param _debtMaturity Maturity of the debt
     * @param _user Address of the user
     * @param _uniswapRouter Address of the Uniswap router
     * @param _poolFee Pool fee
     */
    function executeLiquidationCall(
        bytes32 _collateralCcy,
        uint256[] calldata _collateralMaturities,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        address _uniswapRouter,
        uint24 _poolFee
    ) external onlyOperator {
        collateralMaturities = _collateralMaturities;
        uniswapRouter = _uniswapRouter;
        poolFee = _poolFee;
        lendingMarketController.executeLiquidationCall(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user
        );
    }

    /**
     * @notice Executes the forced repayment.
     * @dev In this liquidation call, Uniswap V2 is used for swapping when poolFee is 0.
     * Otherwise, Uniswap V3 is used.
     *
     * @param _collateralCcy Currency name of the collateral in bytes32
     * @param _collateralMaturities Maturities of the collateral
     * @param _debtCcy Currency name of the debt in bytes32
     * @param _debtMaturity Maturity of the debt
     * @param _user Address of the user
     * @param _uniswapRouter Address of the Uniswap router
     * @param _poolFee Pool fee
     */
    function executeForcedRepayment(
        bytes32 _collateralCcy,
        uint256[] calldata _collateralMaturities,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        address _uniswapRouter,
        uint24 _poolFee
    ) external onlyOperator {
        collateralMaturities = _collateralMaturities;
        uniswapRouter = _uniswapRouter;
        poolFee = _poolFee;
        lendingMarketController.executeForcedRepayment(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user
        );
    }

    /**
     * @notice Executes the operation for collateral as a callback from the lending market controller.
     * @param _liquidator Address of the liquidator
     * @param _user Address of the user
     * @param _collateralCcy Currency name of the collateral in bytes32
     * @param _receivedCollateralAmount Amount of the received collateral
     **/
    function executeOperationForCollateral(
        address _liquidator,
        address _user,
        bytes32 _collateralCcy,
        uint256 _receivedCollateralAmount
    ) external override onlyLendingMarketController returns (bool) {
        for (uint256 i; i < collateralMaturities.length; i++) {
            (, int256 fvAmount) = lendingMarketController.getPosition(
                _collateralCcy,
                collateralMaturities[i],
                address(this)
            );

            if (fvAmount > 0) {
                lendingMarketController.unwindPosition(_collateralCcy, collateralMaturities[i]);
            }
        }

        tokenVault.withdraw(_collateralCcy, _receivedCollateralAmount);

        emit OperationExecuteForCollateral(
            _liquidator,
            _user,
            _collateralCcy,
            _receivedCollateralAmount
        );

        return true;
    }

    /**
     * @notice Executes the operation for debt as a callback from the lending market controller.
     * @param _liquidator Address of the liquidator
     * @param _user Address of the user
     * @param _collateralCcy Currency name of the collateral in bytes32
     * @param _receivedCollateralAmount Amount of the received collateral
     * @param _debtCcy Currency name of the debt in bytes32
     * @param _debtMaturity Maturity of the debt
     * @param _receivedDebtAmount Amount of the received debt
     **/
    function executeOperationForDebt(
        address _liquidator,
        address _user,
        bytes32 _collateralCcy,
        uint256 _receivedCollateralAmount,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        uint256 _receivedDebtAmount
    ) external override onlyLendingMarketController returns (bool) {
        address collateralCcyAddr = tokenVault.getTokenAddress(_collateralCcy);
        address debtCcyAddr = tokenVault.getTokenAddress(_debtCcy);

        // Actual amount of collateral might be less than the received amount because
        // unwinding the position depends on market prices if ZC Bonds are used as collateral.
        // In this case, we need to check the actual balance of the collateral token to be used in the swap.
        uint256 collateralTokenBalance = collateralCcyAddr == nativeToken
            ? address(this).balance
            : IERC20(collateralCcyAddr).balanceOf(address(this));
        uint amountIn = _receivedCollateralAmount > collateralTokenBalance
            ? collateralTokenBalance
            : _receivedCollateralAmount;

        if (collateralCcyAddr != debtCcyAddr && _receivedDebtAmount != 0 && amountIn != 0) {
            if (poolFee == 0) {
                _executeSwapWithV2(
                    collateralCcyAddr,
                    debtCcyAddr,
                    amountIn,
                    collateralCcyAddr == nativeToken,
                    debtCcyAddr == nativeToken
                );
            } else {
                _executeSwapWithV3(
                    collateralCcyAddr,
                    debtCcyAddr,
                    amountIn,
                    poolFee,
                    collateralCcyAddr == nativeToken
                );
            }
        }

        uint256 debtTokenBalance;

        if (debtCcyAddr == nativeToken) {
            debtTokenBalance = address(this).balance;
        } else {
            debtTokenBalance = IERC20(debtCcyAddr).balanceOf(address(this));
            TransferHelper.safeApprove(debtCcyAddr, address(tokenVault), debtTokenBalance);
        }

        if (debtTokenBalance != 0) {
            if (debtCcyAddr == nativeToken) {
                tokenVault.deposit{value: debtTokenBalance}(_debtCcy, debtTokenBalance);
            } else {
                tokenVault.deposit(_debtCcy, debtTokenBalance);
            }

            // If debt is expired, it is under the repayment phase. In this case, we don't need to unwind the position.
            // Instead, repayment will be executed on the protocol side using the liquidator's deposit.
            if (_debtMaturity >= block.timestamp) {
                lendingMarketController.unwindPosition(_debtCcy, _debtMaturity);
            }
        }

        emit OperationExecuteForDebt(
            _liquidator,
            _user,
            _collateralCcy,
            _receivedCollateralAmount,
            _debtCcy,
            _debtMaturity,
            _receivedDebtAmount
        );

        return true;
    }

    /**
     * @notice Deposits funds by the caller into the token vault.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function deposit(bytes32 _ccy, uint256 _amount) external payable onlyOwner {
        _deposit(tokenVault, _ccy, _amount);
    }

    /**
     * @notice Withdraws funds by the caller from the token vault.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function withdraw(bytes32 _ccy, uint256 _amount) external onlyOwner {
        _withdraw(tokenVault, _ccy, _amount);
    }

    function _executeSwapWithV3(
        address _collateralCcy,
        address _debtCcy,
        uint256 _amountIn,
        uint24 _poolFee,
        bool _isNativeCurrency
    ) internal {
        uint256 ethAmount;
        if (_isNativeCurrency) {
            ethAmount = _amountIn;
        } else {
            TransferHelper.safeApprove(_collateralCcy, uniswapRouter, _amountIn);
        }

        ISwapRouterV3.ExactInputSingleParams memory params = ISwapRouterV3.ExactInputSingleParams({
            tokenIn: _collateralCcy,
            tokenOut: _debtCcy,
            fee: _poolFee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: _amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        ISwapRouterV3(uniswapRouter).exactInputSingle{value: ethAmount}(params);
    }

    function _executeSwapWithV2(
        address _collateralCcy,
        address _debtCcy,
        uint256 _amountIn,
        bool _isCollateralInNativeCurrency,
        bool _isDebtInNativeCurrency
    ) internal {
        uint256 amountOutMinimum = 0;
        address[] memory path = new address[](2);
        path[0] = _collateralCcy;
        path[1] = _debtCcy;

        if (_isCollateralInNativeCurrency) {
            ISwapRouterV2(uniswapRouter).swapExactETHForTokens{value: _amountIn}(
                amountOutMinimum,
                path,
                address(this),
                block.timestamp
            );
        } else {
            TransferHelper.safeApprove(_collateralCcy, address(uniswapRouter), _amountIn);

            if (_isDebtInNativeCurrency) {
                ISwapRouterV2(uniswapRouter).swapExactTokensForETH(
                    _amountIn,
                    amountOutMinimum,
                    path,
                    address(this),
                    block.timestamp
                );
            } else {
                ISwapRouterV2(uniswapRouter).swapExactTokensForTokens(
                    _amountIn,
                    amountOutMinimum,
                    path,
                    address(this),
                    block.timestamp
                );
            }
        }
    }
}
