// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";

interface ITokenVault {
    event Deposit(address indexed user, bytes32 ccy, uint256 amount);
    event Withdraw(address indexed user, bytes32 ccy, uint256 amount);
    event RegisterCurrency(bytes32 ccy, address tokenAddress);
    event Swap(
        address indexed user,
        bytes32 ccyIn,
        bytes32 ccyOut,
        uint256 amountIn,
        uint256 amountOut
    );

    function isCovered(
        address user,
        bytes32 ccy,
        uint256 unsettledExp,
        ProtocolTypes.Side _unsettledOrderSide
    ) external view returns (bool);

    function isCovered(address _user) external view returns (bool);

    function isRegisteredCurrency(bytes32 ccy) external view returns (bool);

    function getTokenAddress(bytes32 _ccy) external view returns (address);

    function getWithdrawableCollateral(address user) external view returns (uint256 maxWithdraw);

    function getCoverage(address user) external view returns (uint256 coverage);

    function getUnusedCollateral(address user) external view returns (uint256);

    function getTotalCollateralAmount(address party) external view returns (uint256);

    function getLiquidationAmount(address _user) external view returns (uint256);

    function getDepositAmount(address user, bytes32 ccy) external view returns (uint256);

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getLiquidationThresholdRate() external view returns (uint256 liquidationThresholdRate);

    function getUniswapRouter() external view returns (address uniswapRouter);

    function setCollateralParameters(uint256 _liquidationThresholdRate, address _uniswapRouter)
        external;

    function deposit(bytes32 ccy, uint256 amount) external payable;

    function depositFrom(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) external payable;

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

    function swapCollateral(
        address _user,
        bytes32 _ccyIn,
        bytes32 _ccyOut,
        uint256 _amountInMax,
        uint256 _amountOut
    ) external returns (uint256 amountIn);
}
