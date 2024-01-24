// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../../protocol/interfaces/ITokenVault.sol";
import "../../protocol/interfaces/ILendingMarketController.sol";

contract TokenVaultCaller {
    ITokenVault public tokenVault;
    ILendingMarketController public lendingMarketController;

    constructor(address _tokenVault, address _lendingMarketController) {
        tokenVault = ITokenVault(_tokenVault);
        lendingMarketController = ILendingMarketController(_lendingMarketController);
    }

    function addDepositAmount(address user, bytes32 ccy, uint256 amount) public {
        tokenVault.addDepositAmount(user, ccy, amount);
    }

    function removeDepositAmount(address user, bytes32 ccy, uint256 amount) public {
        tokenVault.removeDepositAmount(user, ccy, amount);
    }

    function cleanUpUsedCurrencies(address user, bytes32 ccy) public {
        tokenVault.cleanUpUsedCurrencies(user, ccy);
    }

    function executeForcedReset(address user, bytes32 ccy) public {
        tokenVault.executeForcedReset(user, ccy);
    }

    function depositFrom(address from, bytes32 ccy, uint256 amount) public {
        tokenVault.depositFrom(from, ccy, amount);
    }

    function transferFrom(bytes32 ccy, address from, address to, uint256 amount) external {
        tokenVault.transferFrom(ccy, from, to, amount);
    }

    function getTotalPresentValueInBaseCurrency(address _user) public view returns (int256) {
        return lendingMarketController.getTotalPresentValueInBaseCurrency(_user);
    }

    function calculateTotalFundsInBaseCurrency(
        address _user,
        ILendingMarketController.AdditionalFunds calldata _additionalFunds,
        uint256 _liquidationThresholdRate
    ) public view returns (ILendingMarketController.CalculatedTotalFunds memory calculatedFunds) {
        return
            lendingMarketController.calculateTotalFundsInBaseCurrency(
                _user,
                _additionalFunds,
                _liquidationThresholdRate
            );
    }

    function calculateFunds(
        bytes32 _ccy,
        address _user,
        uint256 _liquidationThresholdRate
    ) public view returns (ILendingMarketController.CalculatedFunds memory funds) {
        return lendingMarketController.calculateFunds(_ccy, _user, _liquidationThresholdRate);
    }

    function cleanUpFunds(bytes32 _ccy, address _user) public returns (uint256 activeOrderCount) {
        return lendingMarketController.cleanUpFunds(_ccy, _user);
    }

    function isTerminated() public view returns (bool) {
        return lendingMarketController.isTerminated();
    }

    function isRedemptionRequired(address _user) public view returns (bool) {
        return lendingMarketController.isRedemptionRequired(_user);
    }
}
