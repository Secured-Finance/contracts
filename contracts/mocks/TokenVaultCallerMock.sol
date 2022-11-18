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

    function calculateTotalFundsInETH(address _user)
        public
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalObligationAmount,
            uint256 totalBorrowedAmount
        )
    {
        return lendingMarketController.calculateTotalFundsInETH(_user);
    }

    function cleanOrders(bytes32 _ccy, address _user) public {
        return lendingMarketController.cleanOrders(_ccy, _user);
    }
}
