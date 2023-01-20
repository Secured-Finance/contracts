// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {CollateralParametersHandler as Params} from "./libraries/CollateralParametersHandler.sol";
import {ERC20Handler} from "./libraries/ERC20Handler.sol";
import {DepositManagementLogic} from "./libraries/logics/DepositManagementLogic.sol";
// interfaces
import {ITokenVault} from "./interfaces/ITokenVault.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {TokenVaultStorage as Storage} from "./storages/TokenVaultStorage.sol";

/**
 * @notice Implements the management of the token in each currency for users.
 *
 * This contract manages the following data related to tokens.
 * - Deposited token amount as the collateral
 * - Parameters related to the collateral
 *   - Margin Call Threshold Rate
 *   - Auto Liquidation Threshold Rate
 *   - Liquidation Price Rate
 *   - Min Collateral Rate
 *
 * To address a currency as collateral, it must be registered using `registerCurrency` method in this contract.
 */
contract TokenVault is ITokenVault, MixinAddressResolver, Ownable, Proxyable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @notice Modifier to check if currency hasn't been registered yet
     * @param _ccy Currency name in bytes32
     */
    modifier onlyRegisteredCurrency(bytes32 _ccy) {
        require(isRegisteredCurrency(_ccy), "Currency not registered");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     * @param _liquidationThresholdRate The rate used as the auto liquidation threshold
     * @param _liquidationUserFeeRate The liquidation fee rate received by users
     * @param _liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param _uniswapRouter Uniswap router contract address
     * @param _uniswapQuoter Uniswap quoter contract address
     * @param _WETH9 The address of WETH
     */
    function initialize(
        address _owner,
        address _resolver,
        uint256 _liquidationThresholdRate,
        uint256 _liquidationUserFeeRate,
        uint256 _liquidationProtocolFeeRate,
        address _uniswapRouter,
        address _uniswapQuoter,
        address _WETH9
    ) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);

        ERC20Handler.initialize(_WETH9);
        Params.setCollateralParameters(
            _liquidationThresholdRate,
            _liquidationUserFeeRate,
            _liquidationProtocolFeeRate,
            _uniswapRouter,
            _uniswapQuoter
        );
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[2] = Contracts.RESERVE_FUND;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[1] = Contracts.RESERVE_FUND;
    }

    receive() external payable {
        require(msg.sender == ERC20Handler.weth(), "Not WETH");
    }

    /**
     * @notice Gets if the collateral has enough coverage.
     * @param _user User's address
     * @param _unsettledOrderCcy Additional unsettled order currency name in bytes32
     * @param _unsettledOrderAmount Additional unsettled order amount
     * @return The boolean if the collateral has sufficient coverage or not
     */
    function isCovered(
        address _user,
        bytes32 _unsettledOrderCcy,
        uint256 _unsettledOrderAmount,
        ProtocolTypes.Side _unsettledOrderSide
    ) external view override returns (bool) {
        return
            DepositManagementLogic.isCovered(
                _user,
                _unsettledOrderCcy,
                _unsettledOrderAmount,
                ProtocolTypes.Side.BORROW == _unsettledOrderSide
            );
    }

    /**
     * @notice Gets if the collateral has enough coverage.
     * @param _user User's address
     * @return The boolean if the collateral has sufficient coverage or not
     */
    function isCovered(address _user) public view override returns (bool) {
        return DepositManagementLogic.isCovered(_user, "", 0, false);
    }

    /**
     * @notice Gets if the currency is acceptable as collateral
     * @param _ccy Currency name in bytes32
     * @return The boolean if the currency has been registered or not
     */
    function isCollateral(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().collateralCurrencies.contains(_ccy);
    }

    /**
     * @notice Gets if the currencies are acceptable as collateral
     * @param _ccys Currency name list in bytes32
     * @return isCollateralCurrencies Array of the boolean if the currency has been registered or not
     */
    function isCollateral(bytes32[] calldata _ccys)
        external
        view
        override
        returns (bool[] memory isCollateralCurrencies)
    {
        isCollateralCurrencies = new bool[](_ccys.length);
        for (uint256 i = 0; i < _ccys.length; i++) {
            isCollateralCurrencies[i] = isCollateral(_ccys[i]);
        }
    }

    /**
     * @notice Gets if the currency has been registered
     * @param _ccy Currency name in bytes32
     * @return The boolean if the currency has been registered or not
     */
    function isRegisteredCurrency(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().tokenAddresses[_ccy] != address(0);
    }

    /**
     * @notice Gets the token contract address
     * @param _ccy Currency name in bytes32
     * @return The token contract address
     */
    function getTokenAddress(bytes32 _ccy) public view override returns (address) {
        return Storage.slot().tokenAddresses[_ccy];
    }

    /**
     * @notice Gets the currencies accepted as collateral
     * @return Array of the currency accepted as collateral
     */
    function getCollateralCurrencies() external view override returns (bytes32[] memory) {
        return Storage.slot().collateralCurrencies.values();
    }

    /**
     * @notice Gets the maximum amount of ETH that can be withdrawn from user collateral.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
     */
    function getWithdrawableCollateral(address _user) external view override returns (uint256) {
        return DepositManagementLogic.getWithdrawableCollateral(_user);
    }

    /**
     * @notice Gets the rate of collateral used.
     * @param _user User's address
     * @return coverage The rate of collateral used
     */
    function getCoverage(address _user) external view override returns (uint256 coverage) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = DepositManagementLogic
            .getCollateralAmount(_user);

        if (totalCollateral == 0) {
            coverage = totalUsedCollateral == 0 ? 0 : type(uint256).max;
        } else {
            coverage = (totalUsedCollateral * ProtocolTypes.PCT_DIGIT) / totalCollateral;
        }
    }

    /**
     * @notice Gets the total amount of the unused collateral
     * @param _user User's address
     * @return The total amount of unused collateral
     */
    function getUnusedCollateral(address _user) external view override returns (uint256) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = DepositManagementLogic
            .getCollateralAmount(_user);

        return totalCollateral > totalUsedCollateral ? totalCollateral - totalUsedCollateral : 0;
    }

    /**
     * @notice Gets the total collateral amount.
     * @param _user User's address
     * @return totalCollateralAmount The total collateral amount in ETH
     */
    function getTotalCollateralAmount(address _user)
        public
        view
        override
        returns (uint256 totalCollateralAmount)
    {
        (totalCollateralAmount, , ) = DepositManagementLogic.getCollateralAmount(_user);
    }

    /**
     * @notice Gets the amount to be liquidated.
     * @param _user User's address
     * @return liquidationAmount The the amount to be liquidated
     */
    function getLiquidationAmount(address _user)
        external
        view
        override
        returns (uint256 liquidationAmount)
    {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = DepositManagementLogic
            .getCollateralAmount(_user);

        return
            totalCollateral * ProtocolTypes.PCT_DIGIT >=
                totalUsedCollateral * Params.liquidationThresholdRate()
                ? 0
                : totalUsedCollateral / 2;
    }

    /**
     * @notice Gets the total amount deposited of the selected currency
     * @param _ccy Currency name in bytes32
     * @return The total deposited amount
     */
    function getTotalDepositAmount(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().totalDepositAmount[_ccy];
    }

    /**
     * @notice Gets the amount deposited in the user's collateral.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return The deposited amount
     */
    function getDepositAmount(address _user, bytes32 _ccy)
        external
        view
        override
        returns (uint256)
    {
        return DepositManagementLogic.getDepositAmount(_user, _ccy);
    }

    /**
     * @notice Gets the currencies that the user used as collateral.
     * @param _user User's address
     * @return The currency names in bytes32
     */
    function getUsedCurrencies(address _user) public view override returns (bytes32[] memory) {
        return DepositManagementLogic.getUsedCurrencies(_user);
    }

    /**
     * @notice Gets the collateral parameters
     * @return liquidationThresholdRate Auto liquidation threshold rate
     * @return liquidationUserFeeRate Liquidation fee rate received by users
     * @return liquidationProtocolFeeRate Liquidation fee rate received by protocol
     * @return uniswapRouter Uniswap router contract address
     * @return uniswapQuoter Uniswap quoter contract address
     */
    function getCollateralParameters()
        external
        view
        override
        returns (
            uint256 liquidationThresholdRate,
            uint256 liquidationUserFeeRate,
            uint256 liquidationProtocolFeeRate,
            address uniswapRouter,
            address uniswapQuoter
        )
    {
        liquidationThresholdRate = Params.liquidationThresholdRate();
        liquidationUserFeeRate = Params.liquidationUserFeeRate();
        liquidationProtocolFeeRate = Params.liquidationProtocolFeeRate();
        uniswapRouter = address(Params.uniswapRouter());
        uniswapQuoter = address(Params.uniswapQuoter());
    }

    /**
     * @notice Registers new currency and sets if it is acceptable as collateral.
     * @param _ccy Currency name in bytes32
     * @param _tokenAddress Token contract address of the selected currency
     * @param _isCollateral Boolean if the selected currency is acceptable as collateral.
     */
    function registerCurrency(
        bytes32 _ccy,
        address _tokenAddress,
        bool _isCollateral
    ) external onlyOwner {
        require(currencyController().currencyExists(_ccy), "Invalid currency");

        Storage.slot().tokenAddresses[_ccy] = _tokenAddress;
        if (_isCollateral) {
            Storage.slot().collateralCurrencies.add(_ccy);
        }

        emit RegisterCurrency(_ccy, _tokenAddress, _isCollateral);
    }

    /**
     * @notice Updates the currency if it is acceptable as collateral.
     * @param _ccy Currency name in bytes32
     * @param _isCollateral Boolean if the selected currency is acceptable as collateral.
     */
    function updateCurrency(bytes32 _ccy, bool _isCollateral)
        external
        onlyOwner
        onlyRegisteredCurrency(_ccy)
    {
        if (_isCollateral) {
            Storage.slot().collateralCurrencies.add(_ccy);
        } else {
            Storage.slot().collateralCurrencies.remove(_ccy);
        }

        emit UpdateCurrency(_ccy, _isCollateral);
    }

    /**
     * @dev Deposits funds by the caller into collateral.
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function deposit(bytes32 _ccy, uint256 _amount)
        external
        payable
        override
        onlyRegisteredCurrency(_ccy)
    {
        _deposit(msg.sender, _ccy, _amount);
    }

    /**
     * @dev Deposits funds by the `from` into collateral.
     * @param _from user's address
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function depositFrom(
        address _from,
        bytes32 _ccy,
        uint256 _amount
    ) external payable override onlyAcceptedContracts {
        _deposit(_from, _ccy, _amount);
    }

    /**
     * @notice Withdraws funds by the caller from unused collateral.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to withdraw.
     */
    function withdraw(bytes32 _ccy, uint256 _amount)
        external
        override
        onlyRegisteredCurrency(_ccy)
    {
        _withdraw(msg.sender, _ccy, _amount);
    }

    /**
     * @dev Adds deposit amount.
     * @param _user User's address
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function addDepositAmount(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts onlyRegisteredCurrency(_ccy) {
        DepositManagementLogic.addDepositAmount(_user, _ccy, _amount);
    }

    /**
     * @notice Removes deposit amount.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to withdraw.
     */
    function removeDepositAmount(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts onlyRegisteredCurrency(_ccy) {
        DepositManagementLogic.removeDepositAmount(_user, _ccy, _amount);
    }

    /**
     * @notice Swap the deposited amount to convert to a different currency using Uniswap for liquidation.
     * @param _liquidator Liquidator's address
     * @param _user User's address
     * @param _ccyFrom Currency name to be converted from
     * @param _ccyTo Currency name to be converted to
     * @param _amountOut Amount to be converted to
     * @param _poolFee Uniswap pool fee
     */
    function swapDepositAmounts(
        address _liquidator,
        address _user,
        bytes32 _ccyFrom,
        bytes32 _ccyTo,
        uint256 _amountOut,
        uint24 _poolFee
    ) external override onlyAcceptedContracts returns (uint256 amountOut) {
        require(isCollateral(_ccyFrom), "Not registered as collateral");

        uint256 depositAmount = Storage.slot().depositAmounts[_user][_ccyFrom];
        require(depositAmount > 0, "No deposit amount in the selected currency");

        uint256 amountOutWithFee = (_amountOut * ProtocolTypes.PCT_DIGIT) /
            (ProtocolTypes.PCT_DIGIT -
                Params.liquidationUserFeeRate() -
                Params.liquidationProtocolFeeRate());

        uint256 estimatedAmountOut = Params.uniswapQuoter().quoteExactInputSingle(
            getTokenAddress(_ccyFrom),
            getTokenAddress(_ccyTo),
            _poolFee,
            depositAmount,
            0
        );

        if (amountOutWithFee > estimatedAmountOut) {
            amountOutWithFee = estimatedAmountOut;
        }

        ERC20Handler.safeApprove(
            getTokenAddress(_ccyFrom),
            address(Params.uniswapRouter()),
            depositAmount
        );

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: getTokenAddress(_ccyFrom),
            tokenOut: getTokenAddress(_ccyTo),
            fee: _poolFee,
            recipient: address(this),
            deadline: block.timestamp,
            amountOut: amountOutWithFee,
            amountInMaximum: depositAmount,
            sqrtPriceLimitX96: 0
        });

        uint256 amountInWithFee = Params.uniswapRouter().exactOutputSingle(params);
        uint256 liquidatorFee = (amountOutWithFee * Params.liquidationUserFeeRate()) /
            ProtocolTypes.PCT_DIGIT;

        uint256 protocolFee;
        if (amountOutWithFee == estimatedAmountOut) {
            protocolFee =
                (amountOutWithFee * Params.liquidationProtocolFeeRate()) /
                ProtocolTypes.PCT_DIGIT;
            amountOut = amountOutWithFee - liquidatorFee - protocolFee;
        } else {
            protocolFee = amountOutWithFee - _amountOut - liquidatorFee;
            amountOut = _amountOut;
        }

        DepositManagementLogic.removeDepositAmount(_user, _ccyFrom, amountInWithFee);
        DepositManagementLogic.addDepositAmount(_user, _ccyTo, amountOut);
        DepositManagementLogic.addDepositAmount(_liquidator, _ccyTo, liquidatorFee);
        DepositManagementLogic.addDepositAmount(address(reserveFund()), _ccyTo, protocolFee);

        emit Swap(_user, _ccyFrom, _ccyTo, amountInWithFee, _amountOut, liquidatorFee, protocolFee);
    }

    /**
     * @notice Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning.
     *
     * @param _liquidationThresholdRate The auto liquidation threshold rate
     * @param _liquidationUserFeeRate The liquidation fee rate received by users
     * @param _liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param _uniswapRouter Uniswap router contract address
     * @param _uniswapQuoter Uniswap quoter contract address
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(
        uint256 _liquidationThresholdRate,
        uint256 _liquidationUserFeeRate,
        uint256 _liquidationProtocolFeeRate,
        address _uniswapRouter,
        address _uniswapQuoter
    ) external override onlyOwner {
        Params.setCollateralParameters(
            _liquidationThresholdRate,
            _liquidationUserFeeRate,
            _liquidationProtocolFeeRate,
            _uniswapRouter,
            _uniswapQuoter
        );
    }

    function _deposit(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) internal {
        require(_amount > 0, "Invalid amount");
        require(
            Storage.slot().tokenAddresses[_ccy] != ERC20Handler.weth() || _amount == msg.value,
            "Invalid amount"
        );

        ERC20Handler.depositAssets(
            Storage.slot().tokenAddresses[_ccy],
            _user,
            address(this),
            _amount
        );
        DepositManagementLogic.addDepositAmount(_user, _ccy, _amount);

        emit Deposit(_user, _ccy, _amount);
    }

    function _withdraw(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) internal {
        require(_amount > 0, "Invalid amount");

        lendingMarketController().cleanOrders(_ccy, _user);
        uint256 withdrawableAmount = DepositManagementLogic.withdraw(_user, _ccy, _amount);
        ERC20Handler.withdrawAssets(Storage.slot().tokenAddresses[_ccy], _user, withdrawableAmount);

        emit Withdraw(_user, _ccy, withdrawableAmount);
    }
}
