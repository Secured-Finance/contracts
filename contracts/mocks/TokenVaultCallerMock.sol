// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/ITokenVault.sol";
import "../interfaces/ILendingMarketController.sol";

contract TokenVaultCallerMock {
    ITokenVault public tokenVault;
    ILendingMarketController public lendingMarketController;

    constructor(address _tokenVault, address _lendingMarketController) {
        tokenVault = ITokenVault(_tokenVault);
        lendingMarketController = ILendingMarketController(_lendingMarketController);
    }

    function addDepositAmount(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.addDepositAmount(user, ccy, amount);
    }

    function removeDepositAmount(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.removeDepositAmount(user, ccy, amount);
    }

    function swapDepositAmounts(
        address _user,
        bytes32 _ccyIn,
        bytes32 _ccyOut,
        uint256 _amountOut,
        uint24 _poolFee
    ) public returns (uint256 amountIn) {
        return tokenVault.swapDepositAmounts(_user, _ccyIn, _ccyOut, _amountOut, _poolFee);
    }

    function depositFrom(
        address payer,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.depositFrom(payer, ccy, amount);
    }

    function getTotalPresentValueInETH(address _user) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInETH(_user);
    }

    function calculateTotalFundsInETH(address _user)
        public
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount
        )
    {
        return lendingMarketController.calculateTotalFundsInETH(_user);
    }

    function calculateFunds(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 workingLendOrdersAmount,
            uint256 claimableAmount,
            uint256 collateralAmount,
            uint256 lentAmount,
            uint256 workingBorrowOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        return lendingMarketController.calculateFunds(_ccy, _user);
    }

    function cleanOrders(bytes32 _ccy, address _user) public returns (uint256 activeOrderCount) {
        return lendingMarketController.cleanOrders(_ccy, _user);
    }
}
