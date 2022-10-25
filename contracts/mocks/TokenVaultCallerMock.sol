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

    function depositEscrow(
        address payer,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.depositEscrow(payer, ccy, amount);
    }

    function withdrawEscrow(
        address receiver,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.withdrawEscrow(receiver, ccy, amount);
    }

    function getTotalPresentValueInETH(address _account) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInETH(_account);
    }

    function calculateTotalLentFundsInETH(address _account)
        public
        view
        returns (uint256 totalWorkingOrderAmount, uint256 totalClaimAmount)
    {
        return lendingMarketController.calculateTotalLentFundsInETH(_account);
    }

    function calculateTotalBorrowedFundsInETH(address _account)
        public
        view
        returns (
            uint256 totalWorkingOrderAmount,
            uint256 totalObligationAmount,
            uint256 totalBorrowedAmount
        )
    {
        return lendingMarketController.calculateTotalBorrowedFundsInETH(_account);
    }

    function cleanOrders(bytes32 _ccy, address _account) public {
        return lendingMarketController.cleanOrders(_ccy, _account);
    }
}
