// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ITokenVault {
    event ReleaseUnsettled(address indexed party, bytes32 ccy, uint256 amount);
    event UseUnsettledCollateral(address indexed party, bytes32 ccy, uint256 amount);

    event EscrowedAmountAdded(address indexed payer, bytes32 ccy, uint256 amount);
    event EscrowedAmountRemoved(
        address indexed payer,
        address indexed receiver,
        bytes32 ccy,
        uint256 amount
    );

    event Deposit(address user, bytes32 ccy, uint256 amount);
    event Withdraw(address from, bytes32 ccy, uint256 amount);
    event CurrencyRegistered(bytes32 ccy, address tokenAddress);

    function isCovered(address user) external view returns (bool);

    function isRegisteredCurrency(bytes32 ccy) external view returns (bool);

    function getWithdrawableCollateral(address user) external view returns (uint256 maxWithdraw);

    function getCoverage(address user) external view returns (uint256 coverage);

    function getUnsettledCollateral(address user, bytes32 ccy) external view returns (uint256);

    function getUnusedCollateral(address user) external view returns (uint256);

    function getTotalUnsettledExposure(address user) external view returns (uint256);

    function getCollateralAmount(address user, bytes32 ccy) external view returns (uint256);

    function getCollateralAmountInETH(address user, bytes32 ccy) external view returns (uint256);

    function getTotalCollateralAmountInETH(address party) external view returns (uint256);

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getCollateralParameters()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function releaseUnsettledCollateral(
        address user,
        address sender,
        bytes32 ccy,
        uint256 amount
    ) external;

    function releaseUnsettledCollaterals(
        address sender,
        bytes32 ccy,
        address[] calldata users,
        uint256[] calldata amounts
    ) external;

    function setCollateralParameters(
        uint256 marginCallThresholdRate,
        uint256 autoLiquidationThresholdRate,
        uint256 liquidationPriceRate,
        uint256 minCollateralRate
    ) external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function withdraw(bytes32 ccy, uint256 amount) external;

    function addEscrowedAmount(
        address payer,
        bytes32 ccy,
        uint256 amount
    ) external payable;

    function removeEscrowedAmount(
        address payer,
        address receiver,
        bytes32 ccy,
        uint256 amount
    ) external;

    function removeEscrowedAmounts(
        address receiver,
        bytes32 ccy,
        address[] calldata users,
        uint256[] calldata amounts
    ) external;
}
