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

    function addCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.addCollateral(user, ccy, amount);
    }

    function removeCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.removeCollateral(user, ccy, amount);
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

    function calculateTotalLentFundsInETH(address _user)
        public
        view
        returns (
            uint256 totalWorkingOrderAmount,
            uint256 totalClaimAmount,
            uint256 totalLentAmount
        )
    {
        return lendingMarketController.calculateTotalLentFundsInETH(_user);
    }

    function calculateTotalBorrowedFundsInETH(address _user)
        public
        view
        returns (
            uint256 totalWorkingOrderAmount,
            uint256 totalObligationAmount,
            uint256 totalBorrowedAmount
        )
    {
        return lendingMarketController.calculateTotalBorrowedFundsInETH(_user);
    }

    function cleanOrders(address _user) public {
        return lendingMarketController.cleanOrders(_user);
    }
}
