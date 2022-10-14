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

    function releaseUnsettledCollaterals(
        address[] calldata users,
        address sender,
        bytes32 ccy,
        uint256[] calldata amounts
    ) public {
        tokenVault.releaseUnsettledCollaterals(users, sender, ccy, amounts);
    }

    function addEscrowedAmount(
        address payer,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.addEscrowedAmount(payer, ccy, amount);
    }

    function removeEscrowedAmount(
        address payer,
        address receiver,
        bytes32 ccy,
        uint256 amount
    ) public {
        tokenVault.removeEscrowedAmount(payer, receiver, ccy, amount);
    }

    function removeEscrowedAmounts(
        address[] calldata payers,
        address receiver,
        bytes32 ccy,
        uint256[] calldata amounts
    ) public {
        tokenVault.removeEscrowedAmounts(payers, receiver, ccy, amounts);
    }

    function getTotalPresentValueInETH(address _account) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInETH(_account);
    }
}
