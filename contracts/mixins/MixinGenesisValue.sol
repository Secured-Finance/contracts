// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {GenesisValueStorage as Storage, MaturityRate} from "../storages/GenesisValueStorage.sol";

/**
 * @title MixinGenesisValue contract is used to store the genesis value for Lending deals.
 */
contract MixinGenesisValue {
    event Transfer(bytes32 indexed ccy, address indexed from, address indexed to, int256 value);
    event CompoundFactorUpdated(bytes32 indexed ccy, uint256 maturity, uint256 rate, uint256 tenor);

    function isRegisteredCurrency(bytes32 _ccy) public view returns (bool) {
        return Storage.slot().isRegisteredCurrency[_ccy];
    }

    function decimals(bytes32 _ccy) public view returns (uint8) {
        return Storage.slot().decimals[_ccy];
    }

    function getGenesisValue(bytes32 _ccy, address _account) public view returns (int256) {
        return Storage.slot().balances[_ccy][_account];
    }

    function getCompoundFactor(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().compoundFactors[_ccy];
    }

    function getCompoundFactorInMaturity(bytes32 _ccy, uint256 _maturity)
        public
        view
        returns (uint256)
    {
        MaturityRate memory maturityRate = Storage.slot().maturityRates[_ccy][_maturity];
        return maturityRate.compoundFactor;
    }

    function getMaturityRate(bytes32 _ccy, uint256 _maturity)
        public
        view
        returns (MaturityRate memory)
    {
        return Storage.slot().maturityRates[_ccy][_maturity];
    }

    function futureValueOf(
        bytes32 _ccy,
        uint256 _maturity,
        int256 _futureValueInMaturity
    ) public view returns (int256) {
        // NOTE: The formula is:
        // genesisValue = futureValueInMaturity / compoundFactorInMaturity
        // futureValue = genesisValue * currentCompoundFactor.
        return
            (_futureValueInMaturity * int256(getCompoundFactor(_ccy))) /
            int256(getCompoundFactorInMaturity(_ccy, _maturity));
    }

    function registerCurrency(
        bytes32 _ccy,
        uint8 _decimals,
        uint256 _compoundFactor
    ) internal {
        require(_compoundFactor != 0, "Compound factor is zero");
        require(!isRegisteredCurrency(_ccy), "Already registered currency");

        Storage.slot().isRegisteredCurrency[_ccy] = true;
        Storage.slot().decimals[_ccy] = _decimals;
        Storage.slot().initialCompoundFactors[_ccy] = _compoundFactor;
        Storage.slot().compoundFactors[_ccy] = _compoundFactor;
    }

    function updateCompoundFactor(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _rate
    ) internal {
        require(_rate != 0, "rate is zero");
        require(
            Storage.slot().maturityRates[_ccy][_maturity].next == 0,
            "already updated maturity"
        );
        require(_nextMaturity > _maturity, "invalid maturity");
        require(
            Storage.slot().maturityRates[_ccy][_nextMaturity].compoundFactor == 0,
            "existed maturity"
        );

        if (Storage.slot().initialCompoundFactors[_ccy] == Storage.slot().compoundFactors[_ccy]) {
            Storage.slot().maturityRates[_ccy][_maturity].compoundFactor = Storage
                .slot()
                .compoundFactors[_ccy];
        } else {
            require(
                Storage.slot().maturityRates[_ccy][_maturity].compoundFactor != 0,
                "invalid compound factor"
            );
        }

        Storage.slot().maturityRates[_ccy][_maturity].next = _nextMaturity;

        // Save actual compound factor here due to calculating the genesis value from future value.
        // NOTE: The formula is: newCompoundFactor = currentCompoundFactor * (1 + rate * (nextMaturity - maturity) / 360 days).
        uint256 tenor = _nextMaturity - _maturity;
        Storage.slot().compoundFactors[_ccy] = ((
            (Storage.slot().compoundFactors[_ccy] *
                (ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR + _rate * tenor))
        ) / (ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR));

        Storage.slot().maturityRates[_ccy][_nextMaturity] = MaturityRate({
            rate: _rate,
            tenor: tenor,
            compoundFactor: Storage.slot().compoundFactors[_ccy],
            prev: _maturity,
            next: 0
        });

        emit CompoundFactorUpdated(_ccy, _nextMaturity, _rate, tenor);
    }

    function addGenesisValue(
        bytes32 _ccy,
        address _account,
        uint256 _basisMaturity,
        int256 _futureValue
    ) internal returns (bool) {
        // NOTE: The formula is: tokenAmount = featureValue / compoundFactor.
        int256 amount = ((_futureValue * int256(10**decimals(_ccy))) /
            int256(Storage.slot().maturityRates[_ccy][_basisMaturity].compoundFactor));

        if (amount >= 0) {
            Storage.slot().totalLendingSupplies[_ccy] += uint256(amount);
        } else {
            Storage.slot().totalBorrowingSupplies[_ccy] += uint256(-amount);
        }

        Storage.slot().balances[_ccy][_account] += amount;

        emit Transfer(_ccy, address(0), _account, amount);

        return true;
    }
}
