// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IMixinCollateralManagement {
    event LendingMarketAdded(address indexed lendingMarket);
    event LendingMarketRemoved(address indexed lendingMarket);

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
    event CrosschainAddressResolverUpdated(
        address indexed crosschainAddressResolver
    );

    event LiquidationPriceUpdated(uint256 previousPrice, uint256 price);
    event AutoLiquidationThresholdUpdated(uint256 previousRatio, uint256 ratio);
    event MarginCallThresholdUpdated(uint256 previousRatio, uint256 ratio);
    event MinCollateralRatioUpdated(uint256 previousRatio, uint256 price);

    function AUTOLQLEVEL() external view returns (uint256);

    function LQLEVEL() external view returns (uint256);

    function MARGINLEVEL() external view returns (uint256);

    function MIN_COLLATERAL_RATIO() external view returns (uint256);

    function linkLendingMarket(address _lendingMarket) external returns (bool);

    function removeLendingMarket(address _lendingMarket)
        external
        returns (bool);

    function isLendingMarket(address _lendingMarket)
        external
        view
        returns (bool);

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
