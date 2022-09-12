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

    function isCovered(address _user) external view returns (bool);

    function getWithdrawableCollateral(address _user) external view returns (uint256 maxWithdraw);

    function getCoverage(address _user) external view returns (uint256 coverage);

    function getUnsettledCollateral(address user, bytes32 ccy) external view returns (uint256);

    function getUnusedCollateral(address _user) external view returns (uint256);

    function getTotalUnsettledExposure(address _user) external view returns (uint256);

    function getCollateralAmount(address _user, bytes32 _ccy) external view returns (uint256);

    function getCollateralAmountInETH(address _user, bytes32 _ccy) external view returns (uint256);

    function getTotalCollateralAmountInETH(address _party) external view returns (uint256);

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
        bytes32 ccy,
        uint256 amount
    ) external;

    function setCollateralParameters(
        uint256 marginCallThresholdRate,
        uint256 autoLiquidationThresholdRate,
        uint256 liquidationPriceRate,
        uint256 minCollateralRate
    ) external;

    function deposit(bytes32 _ccy, uint256 _amount) external payable;

    function withdraw(bytes32 _ccy, uint256 _amount) external;

    function addEscrowedAmount(
        address _payer,
        bytes32 _ccy,
        uint256 _amount
    ) external payable;

    function removeEscrowedAmount(
        address _payer,
        address _receiver,
        bytes32 _ccy,
        uint256 _amount
    ) external;
}
