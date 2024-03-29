// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {ILendingMarketController} from "../interfaces/ILendingMarketController.sol";

interface ITokenVault {
    error UnregisteredCurrency();
    error InvalidCurrency();
    error InvalidToken();
    error InvalidAmount(bytes32 ccy, uint256 amount, uint256 msgValue);
    error AmountIsZero();
    error CallerNotBaseCurrency(address caller);
    error MarketTerminated();
    error RedemptionIsRequired();

    event Deposit(address indexed user, bytes32 ccy, uint256 amount, address caller);
    event Withdraw(address indexed user, bytes32 ccy, uint256 amount);
    event Transfer(bytes32 indexed ccy, address indexed from, address indexed to, uint256 amount);
    event CurrencyRegistered(bytes32 ccy, address tokenAddress, bool isCollateral);
    event CurrencyUpdated(bytes32 ccy, bool isCollateral);

    function isCovered(
        address user,
        bytes32 ccy
    ) external view returns (bool isEnoughCollateral, bool isEnoughDepositInOrderCcy);

    function isCollateral(bytes32 ccy) external view returns (bool);

    function isCollateral(bytes32[] calldata ccys) external view returns (bool[] memory);

    function isRegisteredCurrency(bytes32 ccy) external view returns (bool);

    function getTokenAddress(bytes32 ccy) external view returns (address);

    function getCollateralCurrencies() external view returns (bytes32[] memory);

    function getWithdrawableCollateral(address user) external view returns (uint256);

    function getWithdrawableCollateral(bytes32 ccy, address user) external view returns (uint256);

    function getCoverage(address user) external view returns (uint256);

    function getTotalUnusedCollateralAmount(address user) external view returns (uint256);

    function getTotalCollateralAmount(address user) external view returns (uint256);

    function getCollateralDetail(
        address user
    )
        external
        view
        returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit);

    function getCollateralAmount(address user, bytes32 ccy) external view returns (uint256);

    function getBorrowableAmount(address user, bytes32 ccy) external view returns (uint256);

    function getLiquidationAmount(
        address user,
        bytes32 liquidationCcy,
        uint256 liquidationAmountMaximum
    ) external view returns (uint256 liquidationAmount, uint256 protocolFee, uint256 liquidatorFee);

    function getTotalDepositAmount(bytes32 ccy) external view returns (uint256);

    function getDepositAmount(address user, bytes32 ccy) external view returns (uint256);

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function calculateCoverage(
        address user,
        ILendingMarketController.AdditionalFunds memory funds
    ) external view returns (uint256 coverage, bool isInsufficientDepositAmount);

    function calculateLiquidationFees(
        uint256 liquidationAmount
    ) external view returns (uint256 protocolFee, uint256 liquidatorFee);

    function registerCurrency(bytes32 ccy, address tokenAddress, bool isCollateral) external;

    function updateCurrency(bytes32 ccy, bool isCollateral) external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function depositTo(bytes32 ccy, uint256 amount, address onBehalfOf) external payable;

    function depositFrom(address user, bytes32 ccy, uint256 amount) external payable;

    function depositWithPermitTo(
        bytes32 ccy,
        uint256 amount,
        address onBehalfOf,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external;

    function depositWithPermitFrom(
        address user,
        bytes32 ccy,
        uint256 amount,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external;

    function withdraw(bytes32 ccy, uint256 amount) external;

    function addDepositAmount(address user, bytes32 ccy, uint256 amount) external;

    function removeDepositAmount(address user, bytes32 ccy, uint256 amount) external;

    function cleanUpUsedCurrencies(address user, bytes32 ccy) external;

    function executeForcedReset(address user, bytes32 ccy) external returns (uint256 removedAmount);

    function transferFrom(
        bytes32 ccy,
        address sender,
        address receiver,
        uint256 amount
    ) external returns (uint256 untransferredAmount);

    function pause() external;

    function unpause() external;

    function getLiquidationThresholdRate() external view returns (uint256 rate);
}
