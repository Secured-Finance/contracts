// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// dependencies
import {IERC20Permit} from "../dependencies/openzeppelin/token/ERC20/extensions/IERC20Permit.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {Multicall} from "../dependencies/openzeppelin/utils/Multicall.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {Constants} from "./libraries/Constants.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";
import {DepositManagementLogic} from "./libraries/logics/DepositManagementLogic.sol";
// interfaces
import {ITokenVault} from "./interfaces/ITokenVault.sol";
import {ILendingMarketController} from "./interfaces/ILendingMarketController.sol";
// mixins
import {MixinAccessControl} from "./mixins/MixinAccessControl.sol";
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinLiquidationConfiguration} from "./mixins/MixinLiquidationConfiguration.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Pausable} from "./utils/Pausable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {TokenVaultStorage as Storage} from "./storages/TokenVaultStorage.sol";

/**
 * @notice Implements the management of the token in each currency for users.
 *
 * This contract manages the following data related to tokens.
 * - Deposited token amount as the collateral
 * - Parameters related to the liquidation
 *   - Liquidation threshold rate
 *   - Liquidation fee rate received by protocol
 *   - Liquidation fee rate received by liquidators
 */
contract TokenVault is
    ITokenVault,
    MixinLiquidationConfiguration,
    MixinAccessControl,
    MixinAddressResolver,
    Pausable,
    Proxyable,
    Multicall
{
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @notice Modifier to check if currency hasn't been registered yet
     * @param _ccy Currency name in bytes32
     */
    modifier onlyRegisteredCurrency(bytes32 _ccy) {
        if (!isRegisteredCurrency(_ccy)) revert UnregisteredCurrency();
        _;
    }

    /**
     * @notice Modifier to check if the protocol is active.
     */
    modifier ifActive() {
        if (lendingMarketController().isTerminated()) revert MarketTerminated();
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     * @param _liquidationThresholdRate The liquidation threshold rate
     * @param _fullLiquidationThresholdRate  The full liquidation threshold rate
     * @param _liquidationProtocolFeeRate The liquidation fee rate received by protocol
     * @param _liquidatorFeeRate The liquidation fee rate received by liquidators
     * @param _nativeToken The address of wrapped token of native currency
     */
    function initialize(
        address _owner,
        address _resolver,
        uint256 _liquidationThresholdRate,
        uint256 _fullLiquidationThresholdRate,
        uint256 _liquidationProtocolFeeRate,
        uint256 _liquidatorFeeRate,
        address _nativeToken
    ) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);

        TransferHelper.initialize(_nativeToken);
        MixinAccessControl._setupInitialRoles(_owner);
        MixinLiquidationConfiguration._initialize(
            _owner,
            _liquidationThresholdRate,
            _fullLiquidationThresholdRate,
            _liquidationProtocolFeeRate,
            _liquidatorFeeRate
        );
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[2] = Contracts.RESERVE_FUND;
    }

    receive() external payable {
        if (!TransferHelper.isNative(msg.sender)) {
            revert CallerNotBaseCurrency({caller: msg.sender});
        }
    }

    /**
     * @notice Gets if the collateral is sufficient or not
     * @param _user User's address
     * @return isEnoughCollateral The boolean if the user has enough collateral or not
     * @return isEnoughDepositInOrderCcy The boolean if the user has enough deposit in the order currency or not
     */
    function isCovered(
        address _user,
        bytes32 _orderCcy
    ) public view override returns (bool isEnoughCollateral, bool isEnoughDepositInOrderCcy) {
        return DepositManagementLogic.isCovered(_user, _orderCcy);
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
    function isCollateral(
        bytes32[] calldata _ccys
    ) external view override returns (bool[] memory isCollateralCurrencies) {
        uint256 length = _ccys.length;
        isCollateralCurrencies = new bool[](length);
        for (uint256 i; i < length; i++) {
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

    // @inheritdoc Proxyable
    function getRevision() external pure override returns (uint256) {
        return 0x2;
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
     * @notice Gets the maximum amount of the base currency that can be withdrawn from user collateral.
     * @param _user User's address
     * @return Maximum amount of the base currency that can be withdrawn
     */
    function getWithdrawableCollateral(address _user) external view override returns (uint256) {
        return DepositManagementLogic.getWithdrawableCollateral(_user);
    }

    /**
     * @notice Gets the maximum amount of the selected currency that can be withdrawn from user collateral.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return Maximum amount of the selected currency that can be withdrawn
     */
    function getWithdrawableCollateral(
        bytes32 _ccy,
        address _user
    ) external view override returns (uint256) {
        return DepositManagementLogic.getWithdrawableCollateral(_ccy, _user);
    }

    /**
     * @notice Gets the rate of collateral used.
     * @param _user User's address
     * @return The rate of collateral used
     */
    function getCoverage(address _user) external view override returns (uint256) {
        return DepositManagementLogic.getCoverage(_user);
    }

    /**
     * @notice Gets the total amount of the unused collateral in the base currency
     * @param _user User's address
     * @return The total amount of unused collateral
     */
    function getTotalUnusedCollateralAmount(
        address _user
    ) external view override returns (uint256) {
        return DepositManagementLogic.getTotalUnusedCollateralAmount(_user);
    }

    /**
     * @notice Gets the total collateral amount.
     * @param _user User's address
     * @return totalCollateralAmount The total collateral amount in the base currency
     */
    function getTotalCollateralAmount(
        address _user
    ) external view override returns (uint256 totalCollateralAmount) {
        (totalCollateralAmount, , ) = DepositManagementLogic.getTotalCollateralAmount(_user);
    }

    /**
     * @notice Gets the collateral detail.
     * @param _user User's address
     * @return totalCollateral The total collateral amount in the base currency
     * @return totalUsedCollateral The total used collateral amount in the base currency
     * @return totalDeposit The total deposit amount in the base currency
     */
    function getCollateralDetail(
        address _user
    )
        external
        view
        override
        returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit)
    {
        (totalCollateral, totalUsedCollateral, totalDeposit) = DepositManagementLogic
            .getTotalCollateralAmount(_user);
    }

    /**
     * @notice Gets the total collateral amount of the selected currency.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return amount The collateral amount
     */
    function getCollateralAmount(
        address _user,
        bytes32 _ccy
    ) external view override returns (uint256 amount) {
        (amount, , ) = DepositManagementLogic.getCollateralAmount(_user, _ccy);
    }

    /**
     * @notice Gets the borrowable amount in the selected currency.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     * @return amount The borrowable amount
     */
    function getBorrowableAmount(
        address _user,
        bytes32 _ccy
    ) external view override returns (uint256) {
        return DepositManagementLogic.getBorrowableAmount(_user, _ccy);
    }

    /**
     * @notice Gets the amount to be liquidated.
     * @param _user User's address
     * @return liquidationAmount The the amount to be liquidated
     */
    function getLiquidationAmount(
        address _user,
        bytes32 _liquidationCcy,
        uint256 _liquidationAmountMaximum
    )
        external
        view
        override
        returns (uint256 liquidationAmount, uint256 protocolFee, uint256 liquidatorFee)
    {
        return
            DepositManagementLogic.getLiquidationAmount(
                _user,
                _liquidationCcy,
                _liquidationAmountMaximum
            );
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
    function getDepositAmount(
        address _user,
        bytes32 _ccy
    ) external view override returns (uint256) {
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
     * @notice Gets the liquidation threshold rate.
     * @return rate The liquidation threshold rate
     */
    function getLiquidationThresholdRate() public view override returns (uint256 rate) {
        (rate, , , ) = getLiquidationConfiguration();
    }

    /**
     * @notice Calculates the collateral rate used when additional funds are had by the user.
     * @param _user User's address
     * @param _additionalFunds Additional funds for calculating the coverage
     * @return coverage The rate of collateral used
     * @return isInsufficientDepositAmount The boolean if the lent amount in the selected currency is insufficient for the deposit amount or not
     */
    function calculateCoverage(
        address _user,
        ILendingMarketController.AdditionalFunds memory _additionalFunds
    ) external view override returns (uint256 coverage, bool isInsufficientDepositAmount) {
        return DepositManagementLogic.calculateCoverage(_user, _additionalFunds);
    }

    /**
     * @notice Gets the actual fee amounts calculated by rates.
     * @param _amount Liquidation amount
     * @return protocolFee Liquidation fee amount received by protocol
     * @return liquidatorFee Liquidation fee amount received by liquidators
     */
    function calculateLiquidationFees(
        uint256 _amount
    ) external view override returns (uint256 protocolFee, uint256 liquidatorFee) {
        return DepositManagementLogic.calculateLiquidationFees(_amount);
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
    ) external override ifActive onlyOwner {
        if (!currencyController().currencyExists(_ccy) || isRegisteredCurrency(_ccy)) {
            revert InvalidCurrency();
        }

        if (_tokenAddress == address(0)) {
            revert InvalidToken();
        }

        Storage.slot().tokenAddresses[_ccy] = _tokenAddress;
        if (_isCollateral) {
            Storage.slot().collateralCurrencies.add(_ccy);
        }

        emit CurrencyRegistered(_ccy, _tokenAddress, _isCollateral);
    }

    /**
     * @notice Updates the currency if it is acceptable as collateral.
     * @param _ccy Currency name in bytes32
     * @param _isCollateral Boolean if the selected currency is acceptable as collateral.
     */
    function updateCurrency(
        bytes32 _ccy,
        bool _isCollateral
    ) external override ifActive onlyOwner onlyRegisteredCurrency(_ccy) {
        if (_isCollateral) {
            Storage.slot().collateralCurrencies.add(_ccy);
        } else {
            Storage.slot().collateralCurrencies.remove(_ccy);
        }

        emit CurrencyUpdated(_ccy, _isCollateral);
    }

    /**
     * @dev Deposits funds by the caller into collateral.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function deposit(
        bytes32 _ccy,
        uint256 _amount
    ) external payable override ifActive whenNotPaused onlyRegisteredCurrency(_ccy) {
        _deposit(msg.sender, _ccy, _amount, msg.sender);
    }

    /**
     * @dev Deposits funds by the caller into collateral.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     * @param _onBehalfOf The beneficiary of the supplied deposits
     */
    function depositTo(
        bytes32 _ccy,
        uint256 _amount,
        address _onBehalfOf
    ) external payable override ifActive whenNotPaused onlyRegisteredCurrency(_ccy) {
        _deposit(msg.sender, _ccy, _amount, _onBehalfOf);
    }

    /**
     * @dev Deposits funds by the `from` into collateral.
     * @param _from Address of the user
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     */
    function depositFrom(
        address _from,
        bytes32 _ccy,
        uint256 _amount
    ) external payable override ifActive whenNotPaused onlyLendingMarketController {
        _deposit(_from, _ccy, _amount, _from);
    }

    /**
     * @dev Deposits funds by the caller into collateral with transfer approval of asset via permit function
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     * @param _onBehalfOf The beneficiary of the supplied deposits
     * @param _deadline The deadline timestamp that the permit is valid
     * @param _permitV The V parameter of ERC712 permit sig
     * @param _permitR The R parameter of ERC712 permit sig
     * @param _permitS The S parameter of ERC712 permit sig
     */
    function depositWithPermitTo(
        bytes32 _ccy,
        uint256 _amount,
        address _onBehalfOf,
        uint256 _deadline,
        uint8 _permitV,
        bytes32 _permitR,
        bytes32 _permitS
    ) external override ifActive whenNotPaused onlyRegisteredCurrency(_ccy) {
        IERC20Permit(getTokenAddress(_ccy)).permit(
            msg.sender,
            address(this),
            _amount,
            _deadline,
            _permitV,
            _permitR,
            _permitS
        );

        _deposit(msg.sender, _ccy, _amount, _onBehalfOf);
    }

    /**
     * @dev Deposits funds by the `from` into collateral with transfer approval of asset via permit function
     * @param _from Address of the user
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to deposit
     * @param _deadline The deadline timestamp that the permit is valid
     * @param _permitV The V parameter of ERC712 permit sig
     * @param _permitR The R parameter of ERC712 permit sig
     * @param _permitS The S parameter of ERC712 permit sig
     */
    function depositWithPermitFrom(
        address _from,
        bytes32 _ccy,
        uint256 _amount,
        uint256 _deadline,
        uint8 _permitV,
        bytes32 _permitR,
        bytes32 _permitS
    ) external override ifActive whenNotPaused onlyLendingMarketController {
        IERC20Permit(getTokenAddress(_ccy)).permit(
            _from,
            address(this),
            _amount,
            _deadline,
            _permitV,
            _permitR,
            _permitS
        );

        _deposit(_from, _ccy, _amount, _from);
    }

    /**
     * @notice Withdraws funds by the caller from unused collateral.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to withdraw.
     */
    function withdraw(
        bytes32 _ccy,
        uint256 _amount
    ) external override whenNotPaused onlyRegisteredCurrency(_ccy) {
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
    ) external override whenNotPaused onlyLendingMarketController onlyRegisteredCurrency(_ccy) {
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
    ) external override whenNotPaused onlyLendingMarketController onlyRegisteredCurrency(_ccy) {
        DepositManagementLogic.removeDepositAmount(_user, _ccy, _amount);
    }

    /**
     * @notice Clean up the used currencies of the user.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     */
    function cleanUpUsedCurrencies(
        address _user,
        bytes32 _ccy
    ) external override whenNotPaused onlyLendingMarketController {
        DepositManagementLogic.cleanUpUsedCurrencies(_user, _ccy);
    }

    /**
     * @notice Forces a reset of the user's deposit amount.
     * @param _user User's address
     * @param _ccy Currency name in bytes32
     */
    function executeForcedReset(
        address _user,
        bytes32 _ccy
    ) external override onlyLendingMarketController onlyRegisteredCurrency(_ccy) returns (uint256) {
        return DepositManagementLogic.executeForcedReset(_user, _ccy);
    }

    /**
     * @notice Transfers the token from sender to receiver.
     * @param _ccy Currency name in bytes32
     * @param _from Sender's address
     * @param _to Receiver's address
     * @param _amount Amount of funds to sent
     */
    function transferFrom(
        bytes32 _ccy,
        address _from,
        address _to,
        uint256 _amount
    )
        external
        override
        whenNotPaused
        onlyLendingMarketController
        onlyRegisteredCurrency(_ccy)
        returns (uint256 untransferredAmount)
    {
        untransferredAmount = DepositManagementLogic.transferFrom(_ccy, _from, _to, _amount);
        emit Transfer(_ccy, _from, _to, _amount - untransferredAmount);
    }

    /**
     * @notice Pauses the token vault.
     */
    function pause() external override onlyOperator {
        _pause();
    }

    /**
     * @notice Unpauses the token vault.
     */
    function unpause() external override onlyOperator {
        _unpause();
    }

    function _deposit(
        address _caller,
        bytes32 _ccy,
        uint256 _amount,
        address _onBehalfOf
    ) internal {
        if (_amount == 0) revert AmountIsZero();

        address tokenAddress = Storage.slot().tokenAddresses[_ccy];
        if (
            (TransferHelper.isNative(tokenAddress) && msg.value != _amount) ||
            (!TransferHelper.isNative(tokenAddress) && msg.value != 0)
        ) {
            revert InvalidAmount(_ccy, _amount, msg.value);
        }

        DepositManagementLogic.deposit(_caller, _ccy, _amount, _onBehalfOf);

        emit Deposit(_onBehalfOf, _ccy, _amount, _caller);
    }

    function _withdraw(address _user, bytes32 _ccy, uint256 _amount) internal {
        if (_amount == 0) revert AmountIsZero();
        if (lendingMarketController().isRedemptionRequired(_user)) revert RedemptionIsRequired();

        lendingMarketController().cleanUpFunds(_ccy, _user);
        uint256 withdrawableAmount = DepositManagementLogic.withdraw(_user, _ccy, _amount);

        emit Withdraw(_user, _ccy, withdrawableAmount);
    }
}
