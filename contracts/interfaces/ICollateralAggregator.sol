// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICollateralAggregator {
    event Register(address indexed addr);
    event ReleaseUnsettled(address indexed party, bytes32 ccy, uint256 amount);
    event UseUnsettledCollateral(address indexed party, bytes32 ccy, uint256 amount);

    function isCoveredUnsettled(
        address _user,
        bytes32 _ccy,
        uint256 _unsettledExp
    ) external view returns (bool);

    function isRegisteredUser(address addr) external view returns (bool);

    function getMaxCollateralBookWithdraw(address _user)
        external
        view
        returns (uint256 maxWithdraw);

    function getUnsettledCoverage(address _user) external view returns (uint256 coverage);

    function getUnsettledCollateral(address user, bytes32 ccy) external view returns (uint256);

    function getTotalUnsettledExp(address _user) external view returns (uint256);

    function getCollateralParameters()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function register() external;

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function releaseUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function setCollateralParameters(
        uint256 marginCallThresholdRate,
        uint256 autoLiquidationThresholdRate,
        uint256 liquidationPriceRate,
        uint256 minCollateralRate
    ) external;
}
