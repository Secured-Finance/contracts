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

    function useUnsettledCollateral(
        address user,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.useUnsettledCollateral(user, ccy, amount);
    }

    function releaseUnsettledCollateral(
        address user,
        address sender,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.releaseUnsettledCollateral(user, sender, ccy, amount);
    }

    function addEscrowedAmount(
        address paye,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.addEscrowedAmount(paye, ccy, amount);
    }

    function removeEscrowedAmount(
        address paye,
        address receiver,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.removeEscrowedAmount(paye, receiver, ccy, amount);
    }

    function getTotalPresentValueInETH(address _account) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInETH(_account);
    }
}
