// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {CollateralParametersHandler} from "./libraries/CollateralParametersHandler.sol";
import {ERC20Handler} from "./libraries/ERC20Handler.sol";
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
     * @param _marginCallThresholdRate The rate used as the margin call threshold
     * @param _autoLiquidationThresholdRate  The rate used as the auto liquidation threshold
     * @param _liquidationPriceRate The rate used as the liquidation price
     * @param _minCollateralRate The rate used minima collateral
     * @param _WETH9 The address of WETH
     */
    function initialize(
        address _owner,
        address _resolver,
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate,
        uint256 _minCollateralRate,
        address _WETH9
    ) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);

        ERC20Handler.initialize(_WETH9);
        CollateralParametersHandler.setCollateralParameters(
            _marginCallThresholdRate,
            _autoLiquidationThresholdRate,
            _liquidationPriceRate,
            _minCollateralRate
        );
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
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
    ) public view override returns (bool) {
        return
            _isCovered(
                _user,
                _unsettledOrderCcy,
                _unsettledOrderAmount,
                ProtocolTypes.Side.BORROW == _unsettledOrderSide
            );
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
     * @notice Gets the maximum amount of ETH that can be withdrawn from user collateral.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
     */
    function getWithdrawableCollateral(address _user) external view virtual returns (uint256) {
        return _getWithdrawableCollateral(_user);
    }

    /**
     * @notice Gets the rate of collateral used.
     * @param _user User's address
     * @return The rate of collateral used
     */
    function getCoverage(address _user) public view override returns (uint256) {
        return _getCoverage(_user);
    }

    /**
     * @notice Gets the total amount of unused collateral
     * @param _user User's address
     * @return The total amount of unused collateral
     */
    function getUnusedCollateral(address _user) external view returns (uint256) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = _getActualCollateralAmount(
            _user,
            "",
            0,
            false
        );

        return totalCollateral > totalUsedCollateral ? totalCollateral - totalUsedCollateral : 0;
    }

    /**
     * @notice Gets the total collateral amount.
     * by converting it to ETH.
     * @param _user Address of collateral user
     * @return totalCollateralAmount The total collateral amount in ETH
     */
    function getTotalCollateralAmount(address _user)
        public
        view
        override
        returns (uint256 totalCollateralAmount)
    {
        (totalCollateralAmount, , ) = _getActualCollateralAmount(_user, "", 0, false);
    }

    /**
     * @notice Gets the amount deposited in the user's collateral.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return The deposited amount
     */
    function getDepositAmount(address _user, bytes32 _ccy) public view override returns (uint256) {
        return Storage.slot().collateralAmounts[_user][_ccy];
    }

    /**
     * @notice Gets the currencies that the user used as collateral.
     * @param _user User's address
     * @return The currency names in bytes32
     */
    function getUsedCurrencies(address _user) public view override returns (bytes32[] memory) {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        uint256 numCurrencies = currencySet.length();
        bytes32[] memory currencies = new bytes32[](numCurrencies);

        for (uint256 i = 0; i < numCurrencies; i++) {
            bytes32 currency = currencySet.at(i);
            currencies[i] = currency;
        }

        return currencies;
    }

    /**
     * @notice Gets parameters related to collateral.
     * @return marginCallThresholdRate The rate used as the margin call threshold
     * @return autoLiquidationThresholdRate  The rate used as the auto liquidation threshold
     * @return liquidationPriceRate The rate used as the liquidation price
     * @return minCollateralRate The rate used minima collateral
     */
    function getCollateralParameters()
        external
        view
        override
        returns (
            uint256 marginCallThresholdRate,
            uint256 autoLiquidationThresholdRate,
            uint256 liquidationPriceRate,
            uint256 minCollateralRate
        )
    {
        return CollateralParametersHandler.getCollateralParameters();
    }

    function registerCurrency(bytes32 _ccy, address _tokenAddress) external onlyOwner {
        require(currencyController().isSupportedCcy(_ccy), "Invalid currency");
        Storage.slot().tokenAddresses[_ccy] = _tokenAddress;

        emit RegisterCurrency(_ccy, _tokenAddress);
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
        require(_amount > 0, "Invalid amount");

        address user = msg.sender;
        uint256 maxWithdrawETH = _getWithdrawableCollateral(user);
        uint256 maxWithdraw = currencyController().convertFromETH(_ccy, maxWithdrawETH);
        uint256 withdrawAmt = _amount > maxWithdraw ? maxWithdraw : _amount;

        require(
            Storage.slot().collateralAmounts[user][_ccy] >= withdrawAmt,
            "Not enough collateral in the selected currency"
        );
        Storage.slot().collateralAmounts[user][_ccy] -= withdrawAmt;

        ERC20Handler.withdrawAssets(Storage.slot().tokenAddresses[_ccy], msg.sender, withdrawAmt);
        _updateUsedCurrencies(msg.sender, _ccy);
        lendingMarketController().cleanOrders(_ccy, msg.sender);

        emit Withdraw(msg.sender, _ccy, withdrawAmt);
    }

    /**
     * @dev Adds collateral amount.
     * @param _user User's address
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function addCollateral(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts onlyRegisteredCurrency(_ccy) {
        Storage.slot().collateralAmounts[_user][_ccy] += _amount;
        _updateUsedCurrencies(_user, _ccy);
    }

    /**
     * @notice Removes collateral amount.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to withdraw.
     */
    function removeCollateral(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts onlyRegisteredCurrency(_ccy) {
        require(
            Storage.slot().collateralAmounts[_user][_ccy] >= _amount,
            "Not enough collateral in the selected currency"
        );

        Storage.slot().collateralAmounts[_user][_ccy] -= _amount;
        _updateUsedCurrencies(_user, _ccy);
    }

    /**
     * @notice Sets main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning.
     *
     * @param _marginCallThresholdRate Margin call threshold ratio
     * @param _autoLiquidationThresholdRate Auto liquidation threshold rate
     * @param _liquidationPriceRate Liquidation price rate
     * @param _minCollateralRate Minimal collateral rate
     * @notice Triggers only be contract owner
     */
    function setCollateralParameters(
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate,
        uint256 _minCollateralRate
    ) external onlyOwner {
        CollateralParametersHandler.setCollateralParameters(
            _marginCallThresholdRate,
            _autoLiquidationThresholdRate,
            _liquidationPriceRate,
            _minCollateralRate
        );
    }

    /**
     * @notice Gets if the collateral has enough coverage.
     * @param _user User's address
     * @param _unsettledOrderCcy Additional unsettled order currency name in bytes32
     * @param _unsettledOrderAmount Additional unsettled order amount
     * @return The boolean if the collateral has enough coverage or not
     */
    function _isCovered(
        address _user,
        bytes32 _unsettledOrderCcy,
        uint256 _unsettledOrderAmount,
        bool _isUnsettledBorrowOrder
    ) internal view returns (bool) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = _getActualCollateralAmount(
            _user,
            _unsettledOrderCcy,
            _unsettledOrderAmount,
            _isUnsettledBorrowOrder
        );

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * ProtocolTypes.PCT_DIGIT >=
                totalUsedCollateral * CollateralParametersHandler.marginCallThresholdRate());
    }

    /**
     * @notice Gets the collateral coverage.
     * @param _user User's address
     * @return coverage The rate of collateral used
     */
    function _getCoverage(address _user) internal view returns (uint256 coverage) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = _getActualCollateralAmount(
            _user,
            "",
            0,
            false
        );

        if (totalCollateral > 0) {
            coverage = (totalUsedCollateral * ProtocolTypes.PCT_DIGIT) / totalCollateral;
        }
    }

    function _getActualCollateralAmount(
        address _user,
        bytes32 _unsettledOrderCcy,
        uint256 _unsettledOrderAmount,
        bool _isUnsettledBorrowOrder
    )
        private
        view
        returns (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalActualCollateral
        )
    {
        (
            uint256 workingLendOrdersAmount,
            uint256 claimableAmount,
            ,
            uint256 lentAmount,
            uint256 workingBorrowOrdersAmount,
            uint256 obligationAmount,
            uint256 borrowedAmount
        ) = lendingMarketController().calculateTotalFundsInETH(_user);

        if (_unsettledOrderAmount > 0) {
            uint256 unsettledOrderAmountInETH = currencyController().convertToETH(
                _unsettledOrderCcy,
                _unsettledOrderAmount
            );

            require(unsettledOrderAmountInETH != 0, "Too small order amount");

            if (_isUnsettledBorrowOrder) {
                workingBorrowOrdersAmount += unsettledOrderAmountInETH;
            } else {
                require(
                    getDepositAmount(_user, _unsettledOrderCcy) >= _unsettledOrderAmount,
                    "Not enough collateral in the selected currency"
                );
                workingLendOrdersAmount += unsettledOrderAmountInETH;
            }
        }

        uint256 totalInternalCollateral = _getTotalInternalCollateralAmountInETH(_user);

        uint256 actualPlusCollateral = totalInternalCollateral + borrowedAmount;
        uint256 plusCollateral = actualPlusCollateral + claimableAmount;
        uint256 minusCollateral = workingLendOrdersAmount + lentAmount;

        totalCollateral = plusCollateral >= minusCollateral ? plusCollateral - minusCollateral : 0;
        totalUsedCollateral = workingBorrowOrdersAmount + obligationAmount;
        totalActualCollateral = actualPlusCollateral >= minusCollateral
            ? actualPlusCollateral - minusCollateral
            : 0;
    }

    /**
     * @notice Calculates maximum amount of ETH that can be withdrawn.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
     */
    function _getWithdrawableCollateral(address _user) internal view returns (uint256) {
        (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalActualCollateral
        ) = _getActualCollateralAmount(_user, "", 0, false);

        if (totalUsedCollateral == 0) {
            return totalActualCollateral;
        } else if (
            totalCollateral * ProtocolTypes.PRICE_DIGIT >
            totalUsedCollateral * CollateralParametersHandler.marginCallThresholdRate()
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - ((totalUsedCollateral) * marginCallThresholdRate).
            uint256 maxWithdraw = (totalCollateral *
                ProtocolTypes.PRICE_DIGIT -
                (totalUsedCollateral) *
                CollateralParametersHandler.marginCallThresholdRate()) / ProtocolTypes.PRICE_DIGIT;
            return maxWithdraw >= totalActualCollateral ? totalActualCollateral : maxWithdraw;
        } else {
            return 0;
        }
    }

    /**
     * @notice Gets the total of amount deposited in the user's collateral of all currencies
     *  in this contract by converting it to ETH.
     * @param _user Address of collateral user
     * @return totalCollateral The total deposited amount in ETH
     */
    function _getTotalInternalCollateralAmountInETH(address _user)
        internal
        view
        returns (uint256 totalCollateral)
    {
        EnumerableSet.Bytes32Set storage currencies = Storage.slot().usedCurrencies[_user];
        uint256 len = currencies.length();

        for (uint256 i = 0; i < len; i++) {
            bytes32 ccy = currencies.at(i);
            uint256 collateralAmount = getDepositAmount(_user, ccy);
            totalCollateral += currencyController().convertToETH(ccy, collateralAmount);
        }

        return totalCollateral;
    }

    function _updateUsedCurrencies(address _user, bytes32 _ccy) internal {
        if (Storage.slot().collateralAmounts[_user][_ccy] > 0) {
            Storage.slot().usedCurrencies[_user].add(_ccy);
        } else {
            Storage.slot().usedCurrencies[_user].remove(_ccy);
        }
    }

    function _deposit(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) internal {
        require(_amount > 0, "Invalid amount");
        ERC20Handler.depositAssets(
            Storage.slot().tokenAddresses[_ccy],
            _user,
            address(this),
            _amount
        );

        Storage.slot().collateralAmounts[_user][_ccy] += _amount;

        _updateUsedCurrencies(_user, _ccy);

        emit Deposit(_user, _ccy, _amount);
    }
}
