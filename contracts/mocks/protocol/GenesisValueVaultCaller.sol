// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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

    function updateGenesisValueWithFutureValue(
        bytes32 ccy,
        address user,
        uint256 basisMaturity,
        int256 fvAmount
    ) external {
        genesisValueVault.updateGenesisValueWithFutureValue(ccy, user, basisMaturity, fvAmount);
    }

    function cleanUpBalance(bytes32 ccy, address user, uint256 maturity) external {
        genesisValueVault.cleanUpBalance(ccy, user, maturity);
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
}
