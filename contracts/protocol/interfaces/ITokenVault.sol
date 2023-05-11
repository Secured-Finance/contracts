// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";

interface ITokenVault {
    event Deposit(address indexed user, bytes32 ccy, uint256 amount);
    event Withdraw(address indexed user, bytes32 ccy, uint256 amount);
    event Transfer(bytes32 indexed ccy, address indexed from, address indexed to, uint256 amount);
    event CurrencyRegistered(bytes32 ccy, address tokenAddress, bool isCollateral);
    event CurrencyUpdated(bytes32 ccy, bool isCollateral);

    function isCovered(
        address user,
        bytes32 ccy,
        uint256 unsettledExp,
        ProtocolTypes.Side unsettledOrderSide
    ) external view returns (bool);

    function isCovered(address user) external view returns (bool);

    function isCollateral(bytes32 _ccy) external view returns (bool);

    function isCollateral(bytes32[] calldata _ccys)
        external
        view
        returns (bool[] memory isCollateralCurrencies);

    function isRegisteredCurrency(bytes32 ccy) external view returns (bool);

    function getTokenAddress(bytes32 ccy) external view returns (address);

    function getCollateralCurrencies() external view returns (bytes32[] memory);

    function getWithdrawableCollateral(address user) external view returns (uint256 maxWithdraw);

    function getWithdrawableCollateral(bytes32 _ccy, address _user) external view returns (uint256);

    function getCoverage(address user) external view returns (uint256 coverage);

    function getUnusedCollateral(address user) external view returns (uint256);

    function getTotalCollateralAmount(address party) external view returns (uint256);

    function getLiquidationAmount(
        address user,
        bytes32 liquidationCcy,
        uint256 liquidationAmountMaximum
    )
        external
        view
        returns (
            uint256 liquidationAmount,
            uint256 protocolFee,
            uint256 liquidatorFee
        );

    function getTotalDepositAmount(bytes32 _ccy) external view returns (uint256);

    function getDepositAmount(address user, bytes32 ccy) external view returns (uint256);

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getCollateralParameters()
        external
        view
        returns (
            uint256 liquidationThresholdRate,
            uint256 liquidationProtocolFeeRate,
            uint256 liquidatorFeeRate
        );

    function setCollateralParameters(
        uint256 liquidationThresholdRate,
        uint256 liquidationProtocolFeeRate,
        uint256 liquidatorFeeRate
    ) external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function depositFrom(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external payable;

    function withdraw(bytes32 ccy, uint256 amount) external;

    function addDepositAmount(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function removeDepositAmount(
        address user,
        bytes32 ccy,
        uint256 amount
    ) external;

    function transferFrom(
        bytes32 _ccy,
        address _sender,
        address _receiver,
        uint256 _amount
    ) external returns (uint256 untransferredAmount);
}