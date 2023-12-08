// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ISwapRouter} from "../dependencies/uniswap/ISwapRouter.sol";
import {IQuoter} from "../dependencies/uniswap/IQuoter.sol";
import {IERC20} from "../dependencies/openzeppelin/token/ERC20/IERC20.sol";

// libraries
import {TransferHelper} from "../protocol/libraries/TransferHelper.sol";
// interfaces
import {ILendingMarketController} from "../protocol/interfaces/ILendingMarketController.sol";
import {ITokenVault} from "../protocol/interfaces/ITokenVault.sol";
import {ILiquidationReceiver} from "../protocol/interfaces/ILiquidationReceiver.sol";
// mixins
import {MixinAccessControl} from "../protocol/mixins/MixinAccessControl.sol";
import {MixinWallet} from "../protocol/mixins/MixinWallet.sol";

contract Liquidator is ILiquidationReceiver, MixinAccessControl, MixinWallet {
    bytes32 public immutable nativeToken;
    ILendingMarketController public immutable lendingMarketController;
    ITokenVault public immutable tokenVault;
    ISwapRouter public immutable uniswapRouter;
    IQuoter public immutable uniswapQuoter;
    uint24 internal poolFee;
    uint256[] internal collateralMaturities;

    modifier onlyLendingMarketController() {
        require(_msgSender() == address(lendingMarketController), "Invalid caller");
        _;
    }

    constructor(
        bytes32 _nativeToken,
        address _lendingMarketController,
        address _tokenVault,
        address _uniswapRouter,
        address _uniswapQuoter
    ) {
        nativeToken = _nativeToken;
        lendingMarketController = ILendingMarketController(_lendingMarketController);
        tokenVault = ITokenVault(_tokenVault);
        uniswapRouter = ISwapRouter(_uniswapRouter);
        uniswapQuoter = IQuoter(_uniswapQuoter);
        MixinAccessControl._setupInitialRoles(msg.sender);
        MixinWallet._initialize(msg.sender, tokenVault.getTokenAddress(_nativeToken));
    }

    receive() external payable {}

    function executeLiquidationCall(
        bytes32 _collateralCcy,
        uint256[] calldata _collateralMaturities,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) external onlyOperator {
        collateralMaturities = _collateralMaturities;
        poolFee = _poolFee;
        lendingMarketController.executeLiquidationCall(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user
        );
    }

    function executeForcedRepayment(
        bytes32 _collateralCcy,
        uint256[] calldata _collateralMaturities,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) external onlyOperator {
        collateralMaturities = _collateralMaturities;
        poolFee = _poolFee;
        lendingMarketController.executeForcedRepayment(
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _user
        );
    }

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
        bool isNativeCurrency = _collateralCcy == nativeToken;

        uint256 collateralTokenBalance = isNativeCurrency
            ? address(this).balance
            : IERC20(collateralCcyAddr).balanceOf(address(this));

        if (_receivedDebtAmount > 0 && collateralTokenBalance != 0) {
            _executeSwap(
                collateralCcyAddr,
                debtCcyAddr,
                collateralTokenBalance,
                0,
                poolFee,
                isNativeCurrency
            );
        }

        uint256 debtTokenBalance;

        if (_debtCcy == nativeToken) {
            debtTokenBalance = address(this).balance;
        } else {
            debtTokenBalance = IERC20(debtCcyAddr).balanceOf(address(this));
            TransferHelper.safeApprove(debtCcyAddr, address(tokenVault), debtTokenBalance);
        }

        if (debtTokenBalance != 0) {
            tokenVault.deposit(_debtCcy, debtTokenBalance);

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
     * @dev Deposits funds by the caller into the token vault.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function deposit(bytes32 _ccy, uint256 _amount) external payable onlyOwner {
        _deposit(tokenVault, _ccy, _amount);
    }

    /**
     * @dev Withdraws funds by the caller from the token vault.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function withdraw(bytes32 _ccy, uint256 _amount) external onlyOwner {
        _withdraw(tokenVault, _ccy, _amount);
    }

    function _executeSwap(
        address _ccyFrom,
        address _ccyTo,
        uint256 _amountIn,
        uint256 _amountOutMinimum,
        uint24 _poolFee,
        bool _isNativeCurrency
    ) internal returns (uint256) {
        uint256 ethAmount;
        if (_isNativeCurrency) {
            ethAmount = _amountIn;
        } else {
            TransferHelper.safeApprove(_ccyFrom, address(uniswapRouter), _amountIn);
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

        return uniswapRouter.exactInputSingle{value: ethAmount}(params);
    }
}
