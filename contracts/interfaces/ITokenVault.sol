// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";

interface ITokenVault {
    event Deposit(address indexed user, bytes32 ccy, uint256 amount);
    event Withdraw(address indexed user, bytes32 ccy, uint256 amount);
    event RegisterCurrency(bytes32 ccy, address tokenAddress, bool isCollateral);
    event UpdateCurrency(bytes32 ccy, bool isCollateral);
    event Swap(
        address indexed user,
        bytes32 ccyIn,
        bytes32 ccyOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 liquidatorFee,
        uint256 protocolFee
    );

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

    function getCoverage(address user) external view returns (uint256 coverage);

    function getUnusedCollateral(address user) external view returns (uint256);

    function getTotalCollateralAmount(address party) external view returns (uint256);

    function getLiquidationAmount(address user) external view returns (uint256 liquidationAmount);

    function getTotalDepositAmount(bytes32 _ccy) external view returns (uint256);

    function getDepositAmount(address user, bytes32 ccy) external view returns (uint256);

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getCollateralParameters()
        external
        view
        returns (
            uint256 liquidationThresholdRate,
            uint256 liquidationUserFeeRate,
            uint256 liquidationProtocolFeeRate,
            address uniswapRouter,
            address uniswapQuoter
        );

    function setCollateralParameters(
        uint256 liquidationThresholdRate,
        uint256 liquidationUserFee,
        uint256 liquidationProtocolFee,
        address uniswapRouter,
        address uniswapQuoter
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

    function swapDepositAmounts(
        address liquidator,
        address user,
        bytes32 ccyFrom,
        bytes32 ccyTo,
        uint256 amountOut,
        uint24 poolFee
    ) external returns (uint256 amountIn);
}
