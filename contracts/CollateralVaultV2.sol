// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/ICollateralVaultV2.sol";
import "./libraries/SafeTransfer.sol";
import "./libraries/CollateralPosition.sol";
import "./mixins/MixinAddressResolverV2.sol";
import "./utils/Ownable.sol";
import "./utils/Proxyable.sol";
import {CollateralVaultStorage as Storage} from "./storages/CollateralVaultStorage.sol";

/**
 * @title CollateralVault is the main implementation contract for storing and keeping user's collateral
 *
 * This contract allows users to deposit and withdraw their funds to fulfill
 * their collateral obligations against different trades.
 *
 * CollateralVault is working with ETH or ERC20 token with specified on deployment `tokenAddress`.
 *
 * CollateralAggregator uses independent Collateral vaults for rebalancing collateral
 * between global books and bilateral positions, and liquidating collateral while performing
 * single or multi-deal liquidation.
 *
 */
contract CollateralVaultV2 is
    ICollateralVaultV2,
    MixinAddressResolverV2,
    Ownable,
    SafeTransfer,
    Proxyable
{
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @dev Modifier to check if user registered on collateral aggregator
     */
    modifier onlyRegisteredUser() {
        require(collateralAggregator().checkRegisteredUser(msg.sender), "User not registered");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address owner,
        address resolver,
        address WETH9
    ) public initializer onlyProxy {
        _transferOwnership(owner);
        _registerToken(WETH9);
        registerAddressResolver(resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
    }

    function registerCurrency(bytes32 _ccy, address _tokenAddress) external onlyOwner {
        require(currencyController().isCollateral(_ccy), "Invalid currency");
        Storage.slot().tokenAddresses[_ccy] = _tokenAddress;
    }

    /**
     * @dev Deposit funds by the msg.sender into collateral book
     * @param _amount Number of funds to deposit
     * @param _ccy Specified currency
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
     * @notice Triggers to withdraw funds by the msg.sender from non-locked funds
     * @param _ccy Specified currency
     * @param _amount Number of funds to withdraw.
     */
    function withdraw(bytes32 _ccy, uint256 _amount) public override onlyRegisteredUser {
        // fix according to collateral aggregator
        require(_amount > 0, "INVALID_AMOUNT");

        address user = msg.sender;
        uint256 maxWidthdrawETH = collateralAggregator().getMaxCollateralBookWidthdraw(user);
        uint256 maxWidthdraw = currencyController().convertFromETH(_ccy, maxWidthdrawETH);
        uint256 withdrawAmt = _amount > maxWidthdraw ? maxWidthdraw : _amount;

        Storage.Book storage book = Storage.slot().books[user][_ccy];
        book.independentAmount = book.independentAmount - withdrawAmt;

        _withdrawAssets(Storage.slot().tokenAddresses[_ccy], msg.sender, withdrawAmt);
        _updateUsedCurrencies(_ccy);

        emit Withdraw(msg.sender, _ccy, withdrawAmt);
    }

    /**
     * @notice Returns independent collateral from `_user` collateral book
     *
     * @param _user Address of collateral user
     * @param _ccy Specified currency
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
     * @notice Returns independent collateral from `_user` collateral book converted to ETH
     *
     * @param _user Address of collateral user
     * @param _ccy Specified currency
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
     * @notice Returns independent collateral from `_user` collateral book converted to ETH
     *
     * @param _user Address of collateral user
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

    function getUsedCurrencies(address user) public view override returns (bytes32[] memory) {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[user];

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
