// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IMixinCollateralManagement {
    event CollateralUserAdded(address indexed user);
    event CollateralUserRemoved(address indexed user);

    event CollateralVaultLinked(address indexed vault, bytes32 ccy, address tokenAddress);
    event CollateralVaultRemoved(address indexed vault, bytes32 ccy, address tokenAddress);

    event CurrencyControllerUpdated(address indexed controller);
    event LiquidationEngineUpdated(address indexed liquidations);
    event CrosschainAddressResolverUpdated(address indexed crosschainAddressResolver);

    event LiquidationPriceRateUpdated(uint256 previousPrice, uint256 price);
    event AutoLiquidationThresholdRateUpdated(uint256 previousRatio, uint256 ratio);
    event MarginCallThresholdRateUpdated(uint256 previousRatio, uint256 ratio);
    event MinCollateralRateUpdated(uint256 previousRatio, uint256 price);

    function getAutoLiquidationThresholdRate() external view returns (uint256);

    function getLiquidationPriceRate() external view returns (uint256);

    function getMarginCallThresholdRate() external view returns (uint256);

    function getMinCollateralRate() external view returns (uint256);

    function addCollateralUser(address _user) external returns (bool);

    function removeCollateralUser(address _user) external returns (bool);

    function isCollateralUser(address _user) external view returns (bool);

    function linkCollateralVault(address _vault) external returns (bool);

    function removeCollateralVault(address _vault) external returns (bool);

    function isCollateralVault(address _vault) external view returns (bool);

    function updateMainParameters(
        uint256 _marginCallThresholdRate,
        uint256 _autoLiquidationThresholdRate,
        uint256 _liquidationPriceRate
    ) external;

    function updateLiquidationPriceRate(uint256 _price) external;

    function updateAutoLiquidationThresholdRate(uint256 _ratio) external;

    function updateMarginCallThresholdRate(uint256 _ratio) external;

    function updateMinCollateralRate(uint256 _ratio) external;
}
