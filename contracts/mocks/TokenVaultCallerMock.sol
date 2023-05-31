// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../protocol/interfaces/ITokenVault.sol";
import "../protocol/interfaces/ILendingMarketController.sol";

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

    function depositFrom(
        address from,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.depositFrom(from, ccy, amount);
    }

    function transferFrom(
        bytes32 ccy,
        address from,
        address to,
        uint256 amount
    ) external {
        tokenVault.transferFrom(ccy, from, to, amount);
    }

    function getTotalPresentValueInBaseCurrency(address _user) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInBaseCurrency(_user);
    }

    function calculateTotalFundsInBaseCurrency(
        address _user,
        bytes32 _depositCcy,
        uint256 _depositAmount
    )
        public
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount,
            bool isEnoughDeposit
        )
    {
        return
            lendingMarketController.calculateTotalFundsInBaseCurrency(
                _user,
                _depositCcy,
                _depositAmount
            );
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

    function cleanUpFunds(bytes32 _ccy, address _user) public returns (uint256 activeOrderCount) {
        return lendingMarketController.cleanUpFunds(_ccy, _user);
    }
}
