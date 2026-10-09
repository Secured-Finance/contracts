// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "../../protocol/interfaces/IGenesisValueVault.sol";
import "../../protocol/interfaces/ILendingMarketController.sol";

contract GenesisValueVaultCaller {
    IGenesisValueVault public genesisValueVault;

    constructor(address _genesisValueVault) {
        genesisValueVault = IGenesisValueVault(_genesisValueVault);
    }

    function initializeCurrencySetting(
        bytes32 ccy,
        uint8 decimals,
        uint256 compoundFactor,
        uint256 maturity
    ) external {
        genesisValueVault.initializeCurrencySetting(ccy, decimals, compoundFactor, maturity);
    }

    function updateInitialCompoundFactor(bytes32 _ccy, uint256 _unitPrice) external {
        genesisValueVault.updateInitialCompoundFactor(_ccy, _unitPrice);
    }

    function updateGenesisValueWithFutureValue(
        bytes32 ccy,
        address user,
        uint256 basisMaturity,
        int256 fvAmount
    ) external {
        genesisValueVault.updateGenesisValueWithFutureValue(ccy, user, basisMaturity, fvAmount);
    }

    function updateGenesisValueWithResidualAmount(
        bytes32 ccy,
        address user,
        uint256 basisMaturity
    ) external {
        genesisValueVault.updateGenesisValueWithResidualAmount(ccy, user, basisMaturity);
    }

    function lock(bytes32 _ccy, address _user, uint256 _amount) external {
        genesisValueVault.lock(_ccy, _user, _amount);
    }

    function unlock(bytes32 _ccy, address _user, uint256 _amount) external {
        genesisValueVault.unlock(_ccy, _user, _amount);
    }

    function transferFrom(
        bytes32 _ccy,
        address _sender,
        address _receiver,
        int256 _amount
    ) external {
        genesisValueVault.transferFrom(_ccy, _sender, _receiver, _amount);
    }

    function cleanUpBalance(bytes32 _ccy, address _user, uint256 _maturity) external {
        genesisValueVault.cleanUpBalance(_ccy, _user, _maturity);
    }

    function executeAutoRoll(
        bytes32 ccy,
        uint256 maturity,
        uint256 nextMaturity,
        uint256 unitPrice,
        uint256 orderFeeRate
    ) external {
        genesisValueVault.executeAutoRoll(ccy, maturity, nextMaturity, unitPrice, orderFeeRate);
    }

    function executeForcedReset(bytes32 _ccy, address _user) external {
        genesisValueVault.executeForcedReset(_ccy, _user);
    }

    function executeForcedReset(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        int256 _amountInFV
    ) external returns (int256 removedAmountInFV, int256 balance) {
        return genesisValueVault.executeForcedReset(_ccy, _maturity, _user, _amountInFV);
    }
}
