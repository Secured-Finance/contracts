// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "../interfaces/ICollateralVault.sol";
import "../interfaces/IMixinCollateralManagement.sol";
import "../utils/Ownable.sol";
import {CollateralAggregatorStorage as Storage} from "../storages/CollateralAggregatorStorage.sol";
import "./MixinAddressResolver.sol";

/**
 * @title MixinCollateralManagement is an internal component of CollateralAggregator contract
 *
 * This contract allows Secured Finance manage the collateral system such as:
 *
 * 1. Update CurrencyController and LiquidationEngine addresses
 * 2. Add different products implementation contracts as collateral users
 * 3. Link deployed collateral vaults
 * 4. Update main collateral parameters like Margin Call ratio,
 *    Auto-Liquidation level, Liquidation price, and Minimal collateral ratio
 *
 */
contract MixinCollateralManagement is
    IMixinCollateralManagement,
    MixinAddressResolver,
    Ownable,
    Initializable
{
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @dev Modifier to check if msg.sender is a CollateralVault
     */
    modifier onlyCollateralVault() {
        require(isCollateralVault(msg.sender), "NON_COLLATERAL_VAULT");
        _;
    }

    modifier onlyLiquidations() {
        require(msg.sender == address(liquidations()), "NON_LIQUIDATIONS");
        _;
    }

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) Ownable() {}

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address owner,
        address resolver,
        uint256 marginCallThresholdRate,
        uint256 autoLiquidationThresholdRate,
        uint256 liquidationPriceRate,
        uint256 minCollateralRate
    ) public initializer {
        _transferOwnership(owner);
        registerAddressResolver(resolver);
        _updateMarginCallThresholdRate(marginCallThresholdRate);
        _updateAutoLiquidationThresholdRate(autoLiquidationThresholdRate);
        _updateLiquidationPriceRate(liquidationPriceRate);
        _updateMinCollateralRate(minCollateralRate);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](4);
        contracts[0] = Contracts.CROSSCHAIN_ADDRESS_RESOLVER;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.LIQUIDATIONS;
        contracts[3] = Contracts.PRODUCT_ADDRESS_RESOLVER;
    }

    function isAcceptedContract(address account) internal view override returns (bool) {
        return
            isCollateralUser(account) ||
            productAddressResolver().isRegisteredProductContract(account) ||
            super.isAcceptedContract(account);
    }

    /**
     * @dev Triggers to add contract address to collateral users address set
     * @param _user Collateral user smart contract address
     *
     * @notice Trifgers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function addCollateralUser(address _user) public override onlyOwner returns (bool) {
        require(_user != address(0), "Zero address");
        require(_user.isContract(), "Can't add non-contract address");
        require(!Storage.slot().collateralUsers.contains(_user), "Can't add existing address");

        emit CollateralUserAdded(_user);

        return Storage.slot().collateralUsers.add(_user);
    }

    /**
     * @dev Triggers to link CollateralVault with aggregator
     * @param _vault CollateralVault address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function linkCollateralVault(address _vault) public override onlyOwner returns (bool) {
        require(_vault != address(0), "Zero address");
        require(_vault.isContract(), "Can't add non-contract address");
        require(!isCollateralVault(_vault), "Can't add existing address");

        ICollateralVault vaultContract = ICollateralVault(_vault);

        bytes32 ccy = vaultContract.ccy();
        address tokenAddress = vaultContract.tokenAddress();

        emit CollateralVaultLinked(_vault, ccy, tokenAddress);
        return Storage.slot().collateralVaults.add(_vault);
    }

    /**
     * @dev Triggers to remove collateral user from address set
     * @param _user Collateral user smart contract address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on removing non-existing collateral user
     */
    function removeCollateralUser(address _user) public override onlyOwner returns (bool) {
        require(Storage.slot().collateralUsers.contains(_user), "Can't remove non-existing user");

        emit CollateralUserRemoved(_user);
        return Storage.slot().collateralUsers.remove(_user);
    }

    /**
     * @dev Triggers to remove CollateralVault from address set
     * @param _vault CollateralVault smart contract address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on removing non-existing collateral vault
     */
    function removeCollateralVault(address _vault) public override onlyOwner returns (bool) {
        require(isCollateralVault(_vault), "Can't remove non-existing user");

        ICollateralVault vaultContract = ICollateralVault(_vault);

        bytes32 ccy = vaultContract.ccy();
        address tokenAddress = vaultContract.tokenAddress();

        emit CollateralVaultRemoved(_vault, ccy, tokenAddress);

        return Storage.slot().collateralVaults.remove(_vault);
    }

    /**
     * @dev Triggers to check if provided `addr` is a CollateralUser from address set
     * @param _user Contract address to check if it's a CollateralUser
     */
    function isCollateralUser(address _user) public view override returns (bool) {
        return Storage.slot().collateralUsers.contains(_user);
    }

    /**
     * @dev Triggers to check if provided address is valid CollateralVault
     * @param _vault Contract address to check if it's a CollateralVault
     */
    function isCollateralVault(address _vault) public view override returns (bool) {
        return Storage.slot().collateralVaults.contains(_vault);
    }

    /**
     * @dev Triggers to safely update main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     *
     * @param _marginCallThresholdRate Margin call threshold ratio
     * @param _autoLiquidationThresholdRate Auto liquidation threshold rate
     * @param _liquidationPriceRate Liquidation price rate
     * @notice Triggers only be contract owner
     */
    function updateMainParameters(
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate
    ) public override onlyOwner {
        if (_marginCallThresholdRate != Storage.slot().marginCallThresholdRate) {
            _updateMarginCallThresholdRate(_marginCallThresholdRate);
        }

        if (_autoLiquidationThresholdRate != Storage.slot().autoLiquidationThresholdRate) {
            _updateAutoLiquidationThresholdRate(_autoLiquidationThresholdRate);
        }

        if (_liquidationPriceRate != Storage.slot().liquidationPriceRate) {
            _updateLiquidationPriceRate(_liquidationPriceRate);
        }
    }

    /**
     * @dev Triggers to update liquidation level rate
     * @param _rate Auto Liquidation level rate
     * @notice Triggers only be contract owner
     */
    function updateAutoLiquidationThresholdRate(uint256 _rate) public override onlyOwner {
        _updateAutoLiquidationThresholdRate(_rate);
    }

    /**
     * @dev Triggers to update margin call level
     * @param _rate Margin call rate
     * @notice Triggers only be contract owner
     */
    function updateMarginCallThresholdRate(uint256 _rate) public override onlyOwner {
        _updateMarginCallThresholdRate(_rate);
    }

    /**
     * @dev Triggers to update liquidation price rate
     * @param _rate Liquidation price rate in basis point
     * @notice Triggers only be contract owner
     */
    function updateLiquidationPriceRate(uint256 _rate) public override onlyOwner {
        _updateLiquidationPriceRate(_rate);
    }

    /**
     * @dev Triggers to update minimal collateral rate
     * @param _rate Minimal collateral rate in basis points
     * @notice Triggers only be contract owner
     */
    function updateMinCollateralRate(uint256 _rate) public override onlyOwner {
        _updateMinCollateralRate(_rate);
    }

    /**
     * @dev Triggers to get auto liquidation threshold rate
     */
    function getAutoLiquidationThresholdRate() public view override returns (uint256) {
        return Storage.slot().autoLiquidationThresholdRate;
    }

    /**
     * @dev Triggers to get liquidation price rate
     */
    function getLiquidationPriceRate() public view override returns (uint256) {
        return Storage.slot().liquidationPriceRate;
    }

    /**
     * @dev Triggers to get margin call threshold rate
     */
    function getMarginCallThresholdRate() public view override returns (uint256) {
        return Storage.slot().marginCallThresholdRate;
    }

    /**
     * @dev Triggers to get min collateral rate
     */
    function getMinCollateralRate() public view override returns (uint256) {
        return Storage.slot().minCollateralRate;
    }

    function _updateAutoLiquidationThresholdRate(uint256 _rate) private {
        require(_rate > 0, "INCORRECT_RATIO");
        require(_rate < Storage.slot().marginCallThresholdRate, "AUTO_LIQUIDATION_RATIO_OVERFLOW");

        emit AutoLiquidationThresholdRateUpdated(
            Storage.slot().autoLiquidationThresholdRate,
            _rate
        );
        Storage.slot().autoLiquidationThresholdRate = _rate;
    }

    function _updateMarginCallThresholdRate(uint256 _rate) private {
        require(_rate > 0, "INCORRECT_RATIO");

        emit MarginCallThresholdRateUpdated(Storage.slot().marginCallThresholdRate, _rate);
        Storage.slot().marginCallThresholdRate = _rate;
    }

    function _updateLiquidationPriceRate(uint256 _rate) private {
        require(_rate > 0, "INCORRECT_RATIO");
        require(_rate < Storage.slot().autoLiquidationThresholdRate, "LIQUIDATION_PRICE_OVERFLOW");

        emit LiquidationPriceRateUpdated(Storage.slot().liquidationPriceRate, _rate);
        Storage.slot().liquidationPriceRate = _rate;
    }

    function _updateMinCollateralRate(uint256 _rate) private {
        require(_rate > 0, "INCORRECT_RATIO");
        require(
            _rate < Storage.slot().autoLiquidationThresholdRate,
            "MIN_COLLATERAL_RATIO_OVERFLOW"
        );

        emit MinCollateralRateUpdated(Storage.slot().minCollateralRate, _rate);
        Storage.slot().minCollateralRate = _rate;
    }
}
