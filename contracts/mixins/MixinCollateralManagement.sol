// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ICollateralVault.sol";
import "../interfaces/IMixinCollateralManagement.sol";
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
    Ownable
{
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public override LQLEVEL; // 120% for liquidation price
    uint256 public override MARGINLEVEL; // 150% margin call threshold
    uint256 public override AUTOLQLEVEL; // 125% auto liquidation
    uint256 public override MIN_COLLATERAL_RATIO; // 25% minimal collateral ratio

    EnumerableSet.AddressSet private lendingMarkets;
    EnumerableSet.AddressSet private collateralVaults;

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

    function requiredContracts()
        public
        pure
        override
        returns (bytes32[] memory contracts)
    {
        contracts = new bytes32[](4);
        contracts[0] = CONTRACT_CROSSCHAIN_ADDRESS_RESOLVER;
        contracts[1] = CONTRACT_CURRENCY_CONTROLLER;
        contracts[2] = CONTRACT_LIQUIDATIONS;
        contracts[3] = CONTRACT_PRODUCT_ADDRESS_RESOLVER;
    }

    function isAcceptedContract(address account)
        internal
        view
        override
        returns (bool)
    {
        return
            isLendingMarket(account) ||
            productAddressResolver().isRegisteredProductContract(account) ||
            super.isAcceptedContract(account);
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) Ownable() {
        LQLEVEL = 12000; // 120% for liquidation price
        MARGINLEVEL = 15000; // 150% margin call threshold
        AUTOLQLEVEL = 12500; // 125% auto liquidatio
        MIN_COLLATERAL_RATIO = 2500; // 25% min collateral ratio
    }

    // =========== LINKED CONTRACT MANAGEMENT SECTION ===========

    /**
     * @dev Trigers to link LendingMarket with aggregator
     * @param _lendingMarket LendingMarket address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function linkLendingMarket(address _lendingMarket)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(_lendingMarket != address(0), "Zero address");
        require(_lendingMarket.isContract(), "Can't add non-contract address");
        require(!isLendingMarket(_lendingMarket), "Can't add existing address");

        emit LendingMarketAdded(_lendingMarket);

        return lendingMarkets.add(_lendingMarket);
    }

    /**
     * @dev Trigers to link CollateralVault with aggregator
     * @param _vault CollateralVault address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function linkCollateralVault(address _vault)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(_vault != address(0), "Zero address");
        require(_vault.isContract(), "Can't add non-contract address");
        require(!isCollateralVault(_vault), "Can't add existing address");

        ICollateralVault vaultContract = ICollateralVault(_vault);

        bytes32 ccy = vaultContract.ccy();
        address tokenAddress = vaultContract.tokenAddress();

        emit CollateralVaultLinked(_vault, ccy, tokenAddress);
        return collateralVaults.add(_vault);
    }

    /**
     * @dev Triggers to remove LendingMarket from address set
     * @param _lendingMarket LendingMarket smart contract address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on removing non-existing LendingMarket
     */
    function removeLendingMarket(address _lendingMarket)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(
            isLendingMarket(_lendingMarket),
            "Can't remove non-existing user"
        );

        emit LendingMarketRemoved(_lendingMarket);
        return lendingMarkets.remove(_lendingMarket);
    }

    /**
     * @dev Triggers to remove CollateralVault from address set
     * @param _vault CollateralVault smart contract address
     *
     * @notice Triggers only be contract owner
     * @notice Reverts on removing non-existing collateral vault
     */
    function removeCollateralVault(address _vault)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(isCollateralVault(_vault), "Can't remove non-existing user");

        ICollateralVault vaultContract = ICollateralVault(_vault);

        bytes32 ccy = vaultContract.ccy();
        address tokenAddress = vaultContract.tokenAddress();

        emit CollateralVaultRemoved(_vault, ccy, tokenAddress);

        return collateralVaults.remove(_vault);
    }

    /**
     * @dev Trigers to check if provided `addr` is a LendingMarket from address set
     * @param _lendingMarket Contract address to check if it's a LendingMarket
     */
    function isLendingMarket(address _lendingMarket)
        public
        view
        override
        returns (bool)
    {
        return lendingMarkets.contains(_lendingMarket);
    }

    /**
     * @dev Trigers to check if provided address is valid CollateralVault
     * @param _vault Contract address to check if it's a CollateralVault
     */
    function isCollateralVault(address _vault)
        public
        view
        override
        returns (bool)
    {
        return collateralVaults.contains(_vault);
    }

    /**
     * @dev Trigers to safely update main collateral parameters this function
     * solves the issue of frontrunning during parameters tuning
     *
     * @param _marginCallRatio Margin call ratio
     * @param _autoLiquidationThreshold Auto Liquidation level ratio
     * @param _liquidationPrice Liquidation price in basis point
     * @notice Trigers only be contract owner
     */
    function updateMainParameters(
        uint256 _marginCallRatio,
        uint256 _autoLiquidationThreshold,
        uint256 _liquidationPrice
    ) public override onlyOwner {
        if (_marginCallRatio != MARGINLEVEL) {
            updateMarginCallThreshold(_marginCallRatio);
        }

        if (_autoLiquidationThreshold != AUTOLQLEVEL) {
            updateAutoLiquidationThreshold(_autoLiquidationThreshold);
        }

        if (_liquidationPrice != LQLEVEL) {
            updateLiquidationPrice(_liquidationPrice);
        }
    }

    /**
     * @dev Trigers to update liquidation level ratio
     * @param _ratio Auto Liquidation level ratio
     * @notice Trigers only be contract owner
     */
    function updateAutoLiquidationThreshold(uint256 _ratio)
        public
        override
        onlyOwner
    {
        require(_ratio > 0, "INCORRECT_RATIO");
        require(_ratio < MARGINLEVEL, "AUTO_LIQUIDATION_RATIO_OVERFLOW");

        emit AutoLiquidationThresholdUpdated(AUTOLQLEVEL, _ratio);
        AUTOLQLEVEL = _ratio;
    }

    /**
     * @dev Trigers to update margin call level
     * @param _ratio Margin call ratio
     * @notice Trigers only be contract owner
     */
    function updateMarginCallThreshold(uint256 _ratio)
        public
        override
        onlyOwner
    {
        require(_ratio > 0, "INCORRECT_RATIO");

        emit MarginCallThresholdUpdated(MARGINLEVEL, _ratio);
        MARGINLEVEL = _ratio;
    }

    /**
     * @dev Trigers to update liquidation price
     * @param _price Liquidation price in basis point
     * @notice Trigers only be contract owner
     */
    function updateLiquidationPrice(uint256 _price) public override onlyOwner {
        require(_price > 0, "INCORRECT_PRICE");
        require(_price < AUTOLQLEVEL, "LIQUIDATION_PRICE_OVERFLOW");

        emit LiquidationPriceUpdated(LQLEVEL, _price);
        LQLEVEL = _price;
    }

    /**
     * @dev Trigers to update minimal collateral ratio
     * @param _ratio Minimal collateral ratio in basis points
     * @notice Trigers only be contract owner
     */
    function updateMinCollateralRatio(uint256 _ratio)
        public
        override
        onlyOwner
    {
        require(_ratio > 0, "INCORRECT_RATIO");
        require(_ratio < AUTOLQLEVEL, "MIN_COLLATERAL_RATIO_OVERFLOW");

        emit MinCollateralRatioUpdated(MIN_COLLATERAL_RATIO, _ratio);
        MIN_COLLATERAL_RATIO = _ratio;
    }
}
