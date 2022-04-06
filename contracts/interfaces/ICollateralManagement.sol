// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface ICollateralManagement {
    event CollateralUserAdded(address indexed user);
    event CollateralUserRemoved(address indexed user);

    event CollateralVaultLinked(
        address indexed vault,
        bytes32 ccy,
        address tokenAddress
    );
    event CollateralVaultRemoved(
        address indexed vault,
        bytes32 ccy,
        address tokenAddress
    );

    event CurrencyControllerUpdated(address indexed controller);
    event LiquidationEngineUpdated(address indexed liquidations);
    event CrosschainAddressResolverUpdated(address indexed crosschainAddressResolver);
    
    event LiquidationPriceUpdated(uint256 previousPrice, uint256 price);
    event AutoLiquidationThresholdUpdated(uint256 previousRatio, uint256 ratio);
    event MarginCallThresholdUpdated(uint256 previousRatio, uint256 ratio);
    event MinCollateralRatioUpdated(uint256 previousRatio, uint256 price);

    function owner() external view returns (address);

    function AUTOLQLEVEL() external view returns (uint256);

    function LQLEVEL() external view returns (uint256);

    function MARGINLEVEL() external view returns (uint256);

    function MIN_COLLATERAL_RATIO() external view returns (uint256);

    function setCurrencyController(address _addr) external;

    function setLiquidationEngine(address _addr) external;

    function setCrosschainAddressResolver(address _addr) external;

    function addCollateralUser(address _user) external returns (bool);

    function removeCollateralUser(address _user) external returns (bool);

    function isCollateralUser(address _user) external view returns (bool);

    function linkCollateralVault(address _vault) external returns (bool);

    function removeCollateralVault(address _vault) external returns (bool);

    function isCollateralVault(address _vault) external view returns (bool);

    function updateMainParameters(
        uint256 _marginCallRatio,
        uint256 _autoLiquidationThreshold,
        uint256 _liquidationPrice
    ) external;

    function updateLiquidationPrice(uint256 _price) external;

    function updateAutoLiquidationThreshold(uint256 _ratio) external;

    function updateMarginCallThreshold(uint256 _ratio) external;

    function updateMinCollateralRatio(uint256 _ratio) external;
}
