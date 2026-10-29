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
import {IConversionAdapter} from "./interfaces/IConversionAdapter.sol";
// mixins
import {MixinAccessControl} from "../../protocol/mixins/MixinAccessControl.sol";
import {MixinWallet} from "../../protocol/mixins/MixinWallet.sol";

contract Liquidator is ILiquidationReceiver, MixinAccessControl, MixinWallet, Initializable {
    error InvalidConversionAdapter(address adapter);
    error InvalidConversionPair(address tokenIn, address tokenOut);
    error InsufficientOutputAmount(uint256 minimumAmountOut, uint256 actualAmountOut);

    event ConversionAdapterUpdated(
        address indexed tokenIn,
        address previousAdapter,
        address newAdapter
    );
    event TokenConverted(
        address indexed adapter,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    address public immutable nativeToken;
    ILendingMarketController public immutable lendingMarketController;
    ITokenVault public immutable tokenVault;

    address public uniswapRouter;
    uint24 public poolFee;
    uint256[] public collateralMaturities;
    uint256 public minimumAmountOut;
    mapping(address => address) public conversionAdapters;

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
     * @param _minimumAmountOut Minimum debt currency amount to receive from the conversion route, or zero if unset
     */
    function executeLiquidationCall(
        bytes32 _collateralCcy,
        uint256[] calldata _collateralMaturities,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        address _uniswapRouter,
        uint24 _poolFee,
        uint256 _minimumAmountOut
    ) external onlyOperator {
        collateralMaturities = _collateralMaturities;
        uniswapRouter = _uniswapRouter;
        poolFee = _poolFee;
        minimumAmountOut = _minimumAmountOut;
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
     * @param _minimumAmountOut Minimum debt currency amount to receive from the conversion route, or zero if unset
     */
    function executeForcedRepayment(
        bytes32 _collateralCcy,
        uint256[] calldata _collateralMaturities,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        address _uniswapRouter,
        uint24 _poolFee,
        uint256 _minimumAmountOut
    ) external onlyOperator {
        collateralMaturities = _collateralMaturities;
        uniswapRouter = _uniswapRouter;
        poolFee = _poolFee;
        minimumAmountOut = _minimumAmountOut;
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
        bool isDebtReceivedInNativeCurrency;

        if (amountIn != 0 && _receivedDebtAmount != 0) {
            bool isV2Router = poolFee == 0;
            address swapToken = collateralCcyAddr;
            bool isSwapTokenNative = collateralCcyAddr == nativeToken;

            if (swapToken != debtCcyAddr) {
                address adapter = conversionAdapters[swapToken];

                if (adapter != address(0)) {
                    (swapToken, amountIn) = _executeConversion(adapter, swapToken, amountIn);
                }
            }

            if (swapToken != debtCcyAddr) {
                if (isV2Router) {
                    _executeSwapWithV2(
                        swapToken,
                        debtCcyAddr,
                        amountIn,
                        isSwapTokenNative,
                        debtCcyAddr == nativeToken
                    );
                    isDebtReceivedInNativeCurrency = debtCcyAddr == nativeToken;
                } else {
                    _executeSwapWithV3(
                        swapToken,
                        debtCcyAddr,
                        amountIn,
                        poolFee,
                        isSwapTokenNative
                    );
                }
            } else if (swapToken == debtCcyAddr) {
                isDebtReceivedInNativeCurrency = isSwapTokenNative;

                if (minimumAmountOut != 0 && amountIn < minimumAmountOut) {
                    revert InsufficientOutputAmount(minimumAmountOut, amountIn);
                }
            }
        }

        uint256 debtTokenBalance;

        if (debtCcyAddr == nativeToken && isDebtReceivedInNativeCurrency) {
            debtTokenBalance = address(this).balance;
        } else {
            debtTokenBalance = IERC20(debtCcyAddr).balanceOf(address(this));
        }

        if (debtTokenBalance != 0) {
            if (debtCcyAddr == nativeToken) {
                if (!isDebtReceivedInNativeCurrency) {
                    TransferHelper.convertFromWrappedToken(address(this), debtTokenBalance);
                }
                tokenVault.deposit{value: debtTokenBalance}(_debtCcy, debtTokenBalance);
            } else {
                TransferHelper.safeApprove(debtCcyAddr, address(tokenVault), debtTokenBalance);
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

    /**
     * @notice Sets the conversion adapter used for an input token.
     * @dev Setting the adapter to the zero address removes the current adapter.
     * @param _tokenIn Address of the token to register the adapter for
     * @param _adapter Address of the conversion adapter, or zero to remove it
     */
    function setConversionAdapter(address _tokenIn, address _adapter) external onlyOwner {
        address previousAdapter = conversionAdapters[_tokenIn];

        if (_adapter != address(0)) {
            if (_adapter.code.length == 0) revert InvalidConversionAdapter(_adapter);

            address adapterTokenIn = IConversionAdapter(_adapter).tokenIn();
            address adapterTokenOut = IConversionAdapter(_adapter).tokenOut();

            if (
                _tokenIn == address(0) ||
                _tokenIn == nativeToken ||
                adapterTokenIn != _tokenIn ||
                adapterTokenOut == address(0) ||
                adapterTokenOut == _tokenIn
            ) {
                revert InvalidConversionPair(adapterTokenIn, adapterTokenOut);
            }
        }

        conversionAdapters[_tokenIn] = _adapter;
        emit ConversionAdapterUpdated(_tokenIn, previousAdapter, _adapter);
    }

    function _executeConversion(
        address _adapter,
        address _tokenIn,
        uint256 _amountIn
    ) internal returns (address tokenOut, uint256 amountOut) {
        tokenOut = IConversionAdapter(_adapter).tokenOut();
        uint256 outputBalanceBefore = IERC20(tokenOut).balanceOf(address(this));

        TransferHelper.safeApprove(_tokenIn, _adapter, _amountIn);
        IConversionAdapter(_adapter).convert(_amountIn);
        TransferHelper.safeApprove(_tokenIn, _adapter, 0);

        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outputBalanceBefore;
        emit TokenConverted(_adapter, _tokenIn, tokenOut, _amountIn, amountOut);
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
            amountOutMinimum: minimumAmountOut,
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
        uint256 amountOutMinimum = minimumAmountOut;
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
