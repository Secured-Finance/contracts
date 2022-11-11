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
 * - Unsettled collateral amount used by order
 * - Escrowed token amount added by lending orders
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
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return The boolean if the collateral has sufficient coverage or not
     */
    function isCovered(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) public view override returns (bool) {
        return _isCovered(_user, _ccy, _unsettledExp);
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
        return _getCoverage(_user, "", 0);
    }

    /**
     * @notice Gets the total amount of unused collateral
     * @param _user User's address
     * @return The total amount of unused collateral
     */
    function getUnusedCollateral(address _user) external view returns (uint256) {
        (uint256 totalCollateral, uint256 totalUsedCollateral) = _getActualCollateralAmount(
            _user,
            "",
            0
        );

        return totalCollateral > totalUsedCollateral ? totalCollateral - totalUsedCollateral : 0;
    }

    /**
     * @notice Gets the amount deposited in the user's collateral.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return The deposited amount
     */
    function getCollateralAmount(address _user, bytes32 _ccy)
        public
        view
        override
        returns (uint256)
    {
        return Storage.slot().collateralAmounts[_user][_ccy];
    }

    /**
     * @notice Gets the amount deposited in the user's collateral by converting it to ETH.
     * @param _user User's address
     * @param _ccy Specified currency
     * @return The deposited amount in ETH
     */
    function getCollateralAmountInETH(address _user, bytes32 _ccy)
        public
        view
        override
        returns (uint256)
    {
        uint256 amount = getCollateralAmount(_user, _ccy);
        return currencyController().convertToETH(_ccy, amount);
    }

    /**
     * @notice Gets the total amount deposited in the user's collateral in all currencies.
     * by converting it to ETH.
     * @param _user Address of collateral user
     * @return The total deposited amount in ETH
     */
    function getTotalCollateralAmountInETH(address _user) public view override returns (uint256) {
        (, , uint256 borrowedAmount) = _getBorrowedFundsFromLendingMarkets(_user, "", 0);
        return _getTotalInternalCollateralAmountInETH(_user) + borrowedAmount;
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
        require(_amount > 0, "Invalid amount");
        ERC20Handler.depositAssets(
            Storage.slot().tokenAddresses[_ccy],
            msg.sender,
            address(this),
            _amount
        );

        Storage.slot().collateralAmounts[msg.sender][_ccy] += _amount;

        _updateUsedCurrencies(msg.sender, _ccy);

        emit Deposit(msg.sender, _ccy, _amount);
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
        // fix according to collateral aggregator
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
        lendingMarketController().cleanOrders(msg.sender);

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
     * @notice deposit funds in escrow.
     * @param _payer Address of user making payment
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to be add into escrow
     */
    function depositEscrow(
        address _payer,
        bytes32 _ccy,
        uint256 _amount
    ) external payable override onlyAcceptedContracts onlyRegisteredCurrency(_ccy) {
        require(_amount > 0, "Invalid amount");

        ERC20Handler.depositAssets(
            Storage.slot().tokenAddresses[_ccy],
            _payer,
            address(this),
            _amount
        );

        emit DepositEscrow(_payer, _ccy, _amount);
    }

    /**
     * @notice Withdraw funds from escrow.
     * @param _receiver Address of user receiving payment
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to be removed from escrow
     */
    function withdrawEscrow(
        address _receiver,
        bytes32 _ccy,
        uint256 _amount
    ) external override onlyAcceptedContracts onlyRegisteredCurrency(_ccy) {
        require(_amount > 0, "Invalid amount");

        ERC20Handler.withdrawAssets(Storage.slot().tokenAddresses[_ccy], _receiver, _amount);

        emit WithdrawEscrow(_receiver, _ccy, _amount);
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
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return The boolean if the collateral has enough coverage or not
     */
    function _isCovered(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (bool) {
        (uint256 totalCollateral, uint256 totalUsedCollateral) = _getActualCollateralAmount(
            _user,
            _ccy,
            _unsettledExp
        );

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * ProtocolTypes.PCT >=
                totalUsedCollateral * CollateralParametersHandler.marginCallThresholdRate());
    }

    /**
     * @notice Gets the collateral coverage.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return coverage The rate of collateral used
     */
    function _getCoverage(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) internal view returns (uint256 coverage) {
        (uint256 totalCollateral, uint256 totalUsedCollateral) = _getActualCollateralAmount(
            _user,
            _ccy,
            _unsettledExp
        );

        if (totalCollateral > 0) {
            coverage = (((totalUsedCollateral) * ProtocolTypes.PCT) / totalCollateral);
        }
    }

    function _getActualCollateralAmount(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) private view returns (uint256 totalCollateral, uint256 totalUsedCollateral) {
        uint256 usedCollateral = _getUsedCollateral(_user);
        (
            uint256 workingOrdersAmount,
            uint256 obligationAmount,
            uint256 borrowedAmount
        ) = _getBorrowedFundsFromLendingMarkets(_user, _ccy, _unsettledExp);

        totalCollateral = _getTotalInternalCollateralAmountInETH(_user) + borrowedAmount;
        totalUsedCollateral = usedCollateral + workingOrdersAmount + obligationAmount;
    }

    /**
     * @notice Gets borrowed funds in all currencies from the Lending Markets.
     * @param _user User's ethereum address
     * @param _ccy Currency name in bytes32
     * @param _unsettledExp Additional exposure to lock into unsettled exposure
     * @return workingOrdersAmount The total working orders amount on the order book
     * @return obligationAmount The total obligation amount due to the borrow orders being filled on the order book
     * @return borrowedAmount The total borrowed amount due to the borrow orders being filled on the order book
     */
    function _getBorrowedFundsFromLendingMarkets(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    )
        internal
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 obligationAmount,
            uint256 borrowedAmount
        )
    {
        (workingOrdersAmount, obligationAmount, borrowedAmount) = lendingMarketController()
            .calculateTotalBorrowedFundsInETH(_user);
        workingOrdersAmount += _unsettledExp > 0
            ? currencyController().convertToETH(_ccy, _unsettledExp)
            : 0;
    }

    /**
     * @notice Gets the total collateral used in all currencies.
     * The collateral used is defined as the negative future value in the lending market contract.
     * @param _user User's address
     * @return The total amount of used collateral
     */
    function _getUsedCollateral(address _user) internal view returns (uint256) {
        int256 totalPVInETH = lendingMarketController().getTotalPresentValueInETH(_user);
        return totalPVInETH > 0 ? 0 : uint256(-totalPVInETH);
    }

    /**
     * @notice Calculates maximum amount of ETH that can be withdrawn.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
     */
    function _getWithdrawableCollateral(address _user) internal view returns (uint256) {
        (uint256 totalCollateral, uint256 totalUsedCollateral) = _getActualCollateralAmount(
            _user,
            "",
            0
        );

        if (totalUsedCollateral == 0) {
            return totalCollateral;
        } else if (
            totalCollateral >
            ((totalUsedCollateral) * CollateralParametersHandler.marginCallThresholdRate()) /
                ProtocolTypes.BP
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - ((totalUsedCollateral) * marginCallThresholdRate).
            return
                (totalCollateral *
                    ProtocolTypes.BP -
                    (totalUsedCollateral) *
                    CollateralParametersHandler.marginCallThresholdRate()) / ProtocolTypes.BP;
        } else {
            return 0;
        }
    }

    /**
     * @notice Gets the total of amount deposited in the user's collateral of all currencies
     *  in this contract by converting it to ETH.
     * @param _user Address of collateral user
     * @return The total deposited amount in ETH
     */
    function _getTotalInternalCollateralAmountInETH(address _user) private view returns (uint256) {
        EnumerableSet.Bytes32Set storage currencies = Storage.slot().usedCurrencies[_user];
        uint256 collateralAmount;
        uint256 totalCollateral;

        uint256 len = currencies.length();

        for (uint256 i = 0; i < len; i++) {
            bytes32 ccy = currencies.at(i);
            collateralAmount = currencyController().convertToETH(
                ccy,
                getCollateralAmount(_user, ccy)
            );
            totalCollateral = totalCollateral + collateralAmount;
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
}
