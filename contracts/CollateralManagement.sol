// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./interfaces/ICollateralManagement.sol";
import "./interfaces/ICurrencyController.sol";
import "./interfaces/ICollateralVault.sol";
import "./interfaces/ILiquidations.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

/**
 * @title CollateralManagement is an internal component of CollateralAggregator contract
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
contract CollateralManagement is ICollateralManagement {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public override LQLEVEL; // 120% for liquidation price
    uint256 public override MARGINLEVEL; // 150% margin call threshold
    uint256 public override AUTOLQLEVEL; // 125% auto liquidation
    uint256 public override MIN_COLLATERAL_RATIO; // 25% minimal collateral ratio

    address public override owner;

    // Linked contract addresses
    ICurrencyController public currencyController;
    ILiquidations public liquidationEngine;
    EnumerableSet.AddressSet private collateralUsers;
    EnumerableSet.AddressSet private collateralVaults;

    /**
     * @dev Modifier to make a function callable only by contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "INVALID_ACCESS");
        _;
    }

    /**
     * @dev Modifier to check if msg.sender is collateral user
     */
    modifier acceptedContract() {
        require(collateralUsers.contains(msg.sender), "NON_COLLATERAL_USER");
        _;
    }

    /**
     * @dev Modifier to check if msg.sender is a CollateralVault
     */
    modifier onlyCollateralVault() {
        require(collateralVaults.contains(msg.sender), "NON_COLLATERAL_VAULT");
        _;
    }

    modifier onlyLiquidationEngine() {
        require(
            msg.sender == address(liquidationEngine),
            "NON_LIQUIDATION_ENGINE"
        );
        _;
    }

    modifier onlyLiquidationEngineOrCollateralUser() {
        require(
            msg.sender == address(liquidationEngine) ||
                collateralUsers.contains(msg.sender),
            "NOR_LIQUIDATION_ENGINE_COLLATERAL_USER"
        );
        _;
    }

    /**
     * @dev Contract constructor function.
     *
     * @notice sets contract deployer as owner of this contract
     */
    constructor() public {
        owner = msg.sender;

        LQLEVEL = 12000; // 120% for liquidation price
        MARGINLEVEL = 15000; // 150% margin call threshold
        AUTOLQLEVEL = 12500; // 125% auto liquidatio
        MIN_COLLATERAL_RATIO = 2500; // 25% min collateral ratio
    }

    // =========== LINKED CONTRACT MANAGEMENT SECTION ===========

    /**
     * @dev Trigers to add contract address to collateral users address set
     * @param _user Collateral user smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function addCollateralUser(address _user)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(_user != address(0), "Zero address");
        require(_user.isContract(), "Can't add non-contract address");
        require(!collateralUsers.contains(_user), "Can't add existing address");

        emit CollateralUserAdded(_user);

        return collateralUsers.add(_user);
    }

    /**
     * @dev Trigers to link CollateralVault with aggregator
     * @param _vault CollateralVault smart contract address
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
        require(
            !collateralVaults.contains(_vault),
            "Can't add existing address"
        );

        ICollateralVault vaultContract = ICollateralVault(_vault);

        bytes32 ccy = vaultContract.ccy();
        address tokenAddress = vaultContract.tokenAddress();

        emit CollateralVaultLinked(_vault, ccy, tokenAddress);
        return collateralVaults.add(_vault);
    }

    /**
     * @dev Trigers to remove collateral user from address set
     * @param _user Collateral user smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on removing non-existing collateral user
     */
    function removeCollateralUser(address _user)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(
            collateralUsers.contains(_user),
            "Can't remove non-existing user"
        );

        emit CollateralUserRemoved(_user);
        return collateralUsers.remove(_user);
    }

    /**
     * @dev Trigers to remove CollateralVault from address set
     * @param _vault CollateralVault smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on removing non-existing collateral vault
     */
    function removeCollateralVault(address _vault)
        public
        override
        onlyOwner
        returns (bool)
    {
        require(
            collateralVaults.contains(_vault),
            "Can't remove non-existing user"
        );

        ICollateralVault vaultContract = ICollateralVault(_vault);

        bytes32 ccy = vaultContract.ccy();
        address tokenAddress = vaultContract.tokenAddress();

        emit CollateralVaultRemoved(_vault, ccy, tokenAddress);

        return collateralVaults.remove(_vault);
    }

    /**
     * @dev Trigers to check if provided `addr` is a collateral user from address set
     * @param _user Contract address to check if it's a collateral user
     */
    function isCollateralUser(address _user)
        public
        view
        override
        returns (bool)
    {
        return collateralUsers.contains(_user);
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
     * @dev Trigers to add currency controller contract address
     * @param _addr Currency Controller smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function setCurrencyController(address _addr) public override onlyOwner {
        require(_addr != address(0), "Zero address");
        require(_addr.isContract(), "Can't add non-contract address");

        currencyController = ICurrencyController(_addr);

        emit CurrencyControllerUpdated(_addr);
    }

    /**
     * @dev Trigers to set liquidation engine contract address
     * @param _addr LiquidationEngine smart contract address
     *
     * @notice Trigers only be contract owner
     * @notice Reverts on saving 0x0 address
     */
    function setLiquidationEngine(address _addr) public override onlyOwner {
        require(_addr != address(0), "Zero address");
        require(_addr.isContract(), "Can't add non-contract address");

        liquidationEngine = ILiquidations(_addr);

        emit LiquidationEngineUpdated(_addr);
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
