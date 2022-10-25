// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ITokenVault {
    event DepositEscrow(address indexed payer, bytes32 ccy, uint256 amount);
    event WithdrawEscrow(address indexed receiver, bytes32 ccy, uint256 amount);

    event Deposit(address indexed user, bytes32 ccy, uint256 amount);
    event Withdraw(address indexed user, bytes32 ccy, uint256 amount);
    event RegisterCurrency(bytes32 ccy, address tokenAddress);

    function isCovered(address user) external view returns (bool);

    function isRegisteredCurrency(bytes32 ccy) external view returns (bool);

    function getWithdrawableCollateral(address user) external view returns (uint256 maxWithdraw);

    function getCoverage(address user) external view returns (uint256 coverage);

    function getUnusedCollateral(address user) external view returns (uint256);

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

    function setCollateralParameters(
        uint256 marginCallThresholdRate,
        uint256 autoLiquidationThresholdRate,
        uint256 liquidationPriceRate,
        uint256 minCollateralRate
    ) external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function withdraw(bytes32 ccy, uint256 amount) external;

    function addCollateral(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external;

    function removeCollateral(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external;

    function depositEscrow(
        address payer,
        bytes32 ccy,
        uint256 amount
    ) external payable;

    function withdrawEscrow(
        address receiver,
        bytes32 ccy,
        uint256 amount
    ) external;
}
