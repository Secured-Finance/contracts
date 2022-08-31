// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
// interfaces
import {ICollateralVault} from "./interfaces/ICollateralVault.sol";
import {SafeTransfer} from "./libraries/SafeTransfer.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {CollateralVaultStorage as Storage} from "./storages/CollateralVaultStorage.sol";

/**
 * @notice Implements the management of the collateral in each currency for users.
 * This contract allows users to deposit and withdraw various currencies as collateral.
 *
 * Currencies that can be used as collateral are registered in the following steps.
 * 1. Call the `supportCurrency` method in `CurrencyController.sol`.
 * 2. Call the `registerCurrency` method in this contract.
 *
 * @dev This contract has overlapping roles with `CollateralAggregator.sol`, so it will be merged
 * with `CollateralAggregator.sol` in the future.
 */
contract CollateralVault is
    ICollateralVault,
    MixinAddressResolver,
    Ownable,
    SafeTransfer,
    Proxyable
{
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @notice Modifier to check if user registered on collateral aggregator
     */
    modifier onlyRegisteredUser() {
        require(collateralAggregator().isRegisteredUser(msg.sender), "User not registered");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     * @param _WETH9 The address of WETH
     */
    function initialize(
        address _owner,
        address _resolver,
        address _WETH9
    ) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
        _registerToken(_WETH9);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
    }

    // @inheritdoc MixinAddressResolver
    function registerCurrency(bytes32 _ccy, address _tokenAddress) external onlyOwner {
        require(currencyController().isCollateral(_ccy), "Invalid currency");
        Storage.slot().tokenAddresses[_ccy] = _tokenAddress;

        emit CurrencyRegistered(_ccy, _tokenAddress);
    }

    /**
     * @dev Deposits funds by the caller into collateral.
     * @param _amount Amount of funds to deposit
     * @param _ccy Currency name in bytes32
     */
    function deposit(bytes32 _ccy, uint256 _amount) public payable override onlyRegisteredUser {
        require(Storage.slot().tokenAddresses[_ccy] != address(0), "Invalid currency");
        require(_amount > 0, "Invalid amount");
        _depositAssets(Storage.slot().tokenAddresses[_ccy], msg.sender, address(this), _amount);

        Storage.Book storage book = Storage.slot().books[msg.sender][_ccy];
        book.independentAmount = book.independentAmount + _amount;

        _updateUsedCurrencies(_ccy);

        emit Deposit(msg.sender, _ccy, _amount);
    }

    /**
     * @notice Withdraws funds by the caller from unused collateral.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to withdraw.
     */
    function withdraw(bytes32 _ccy, uint256 _amount) public override onlyRegisteredUser {
        // fix according to collateral aggregator
        require(_amount > 0, "Invalid amount");

        address user = msg.sender;
        uint256 maxWithdrawETH = collateralAggregator().getWithdrawableCollateral(user);
        uint256 maxWithdraw = currencyController().convertFromETH(_ccy, maxWithdrawETH);
        uint256 withdrawAmt = _amount > maxWithdraw ? maxWithdraw : _amount;

        Storage.Book storage book = Storage.slot().books[user][_ccy];
        book.independentAmount = book.independentAmount - withdrawAmt;

        _withdrawAssets(Storage.slot().tokenAddresses[_ccy], msg.sender, withdrawAmt);
        _updateUsedCurrencies(_ccy);

        emit Withdraw(msg.sender, _ccy, withdrawAmt);
    }

    /**
     * @notice Gets the amount deposited in the user's collateral.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return The deposited amount
     */
    function getIndependentCollateral(address _user, bytes32 _ccy)
        public
        view
        override
        returns (uint256)
    {
        return Storage.slot().books[_user][_ccy].independentAmount;
    }

    /**
     * @notice Gets the amount deposited in the user's collateral by converting it to ETH.
     * @param _user User's address
     * @param _ccy Specified currency
     * @return The deposited amount in ETH
     */
    function getIndependentCollateralInETH(address _user, bytes32 _ccy)
        public
        view
        override
        returns (uint256)
    {
        uint256 amount = getIndependentCollateral(_user, _ccy);
        return currencyController().convertToETH(_ccy, amount);
    }

    /**
     * @notice Gets the total amount deposited in the user's collateral in all currencies.
     * by converting it to ETH.
     * @param _user Address of collateral user
     * @return The total deposited amount in ETH
     */
    function getTotalIndependentCollateralInETH(address _user)
        public
        view
        override
        returns (uint256)
    {
        EnumerableSet.Bytes32Set storage currencies = Storage.slot().usedCurrencies[_user];
        uint256 independentCollateral;
        uint256 totalCollateral;

        uint256 len = currencies.length();

        for (uint256 i = 0; i < len; i++) {
            bytes32 ccy = currencies.at(i);
            independentCollateral = getIndependentCollateralInETH(_user, ccy);
            totalCollateral = totalCollateral + independentCollateral;
        }

        return totalCollateral;
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

    function _updateUsedCurrencies(bytes32 _ccy) internal {
        if (
            Storage.slot().books[msg.sender][_ccy].independentAmount > 0 ||
            Storage.slot().books[msg.sender][_ccy].lockedCollateral > 0
        ) {
            Storage.slot().usedCurrencies[msg.sender].add(_ccy);
        } else {
            Storage.slot().usedCurrencies[msg.sender].remove(_ccy);
        }
    }
}
