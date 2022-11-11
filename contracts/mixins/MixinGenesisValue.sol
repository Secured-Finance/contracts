// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {GenesisValueStorage as Storage, MaturityUnitPrice} from "../storages/GenesisValueStorage.sol";

/**
 * @title MixinGenesisValue contract is used to store the genesis value for Lending deals.
 */
contract MixinGenesisValue {
    event Transfer(bytes32 indexed ccy, address indexed from, address indexed to, int256 value);
    event CompoundFactorUpdated(
        bytes32 indexed ccy,
        uint256 compoundFactor,
        uint256 unitPrice,
        uint256 currentMaturity,
        uint256 previousMaturity
    );

    function isRegisteredCurrency(bytes32 _ccy) public view returns (bool) {
        return Storage.slot().isRegisteredCurrency[_ccy];
    }

    function decimals(bytes32 _ccy) public view returns (uint8) {
        return Storage.slot().decimals[_ccy];
    }

    function getTotalLendingSupply(bytes32 _ccy) external view returns (uint256) {
        return Storage.slot().totalLendingSupplies[_ccy];
    }

    function getTotalBorrowingSupply(bytes32 _ccy) external view returns (uint256) {
        return Storage.slot().totalBorrowingSupplies[_ccy];
    }

    function getGenesisValue(bytes32 _ccy, address _account) public view returns (int256) {
        return Storage.slot().balances[_ccy][_account];
    }

    function getCurrentMaturity(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().currentMaturity[_ccy];
    }

    function getCompoundFactor(bytes32 _ccy) public view returns (uint256) {
        return Storage.slot().compoundFactors[_ccy];
    }

    function getMaturityUnitPrice(bytes32 _ccy, uint256 _maturity)
        public
        view
        returns (MaturityUnitPrice memory)
    {
        return Storage.slot().maturityUnitPrices[_ccy][_maturity];
    }

    function getGenesisValueInFutureValue(bytes32 _ccy, address _account)
        public
        view
        returns (int256)
    {
        // NOTE: The formula is:
        // futureValue = genesisValue * currentCompoundFactor.
        return
            (getGenesisValue(_ccy, _account) * int256(getCompoundFactor(_ccy))) /
            int256(10**decimals(_ccy));
    }

    function _calculateGVFromFV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _futureValue
    ) internal view returns (int256) {
        uint256 compoundFactor = Storage
        .slot()
        .maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");

        // NOTE: The formula is: genesisValue = featureValue / compoundFactor.
        return (_futureValue * int256(10**decimals(_ccy))) / int256(compoundFactor);
    }

    function _calculatePVFromFV(uint256 _futureValue, uint256 _unitPrice)
        internal
        pure
        returns (uint256)
    {
        // NOTE: The formula is: presentValue = futureValue * unit price.
        return (_futureValue * _unitPrice) / ProtocolTypes.BP;
    }

    function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice)
        internal
        pure
        returns (int256)
    {
        // NOTE: The formula is: presentValue = futureValue * unit price.
        return (_futureValue * int256(_unitPrice)) / int256(ProtocolTypes.BP);
    }

    function _registerCurrency(
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

    function _updateCompoundFactor(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _unitPrice
    ) internal {
        require(_unitPrice != 0, "unitPrice is zero");
        require(
            Storage.slot().maturityUnitPrices[_ccy][_maturity].next == 0,
            "already updated maturity"
        );
        require(_nextMaturity > _maturity, "invalid maturity");
        require(
            Storage.slot().maturityUnitPrices[_ccy][_nextMaturity].compoundFactor == 0,
            "existed maturity"
        );

        if (Storage.slot().initialCompoundFactors[_ccy] == Storage.slot().compoundFactors[_ccy]) {
            Storage.slot().maturityUnitPrices[_ccy][_maturity].compoundFactor = Storage
                .slot()
                .compoundFactors[_ccy];
        } else {
            require(
                Storage.slot().maturityUnitPrices[_ccy][_maturity].compoundFactor != 0,
                "invalid compound factor"
            );
        }

        Storage.slot().maturityUnitPrices[_ccy][_maturity].next = _nextMaturity;

        // Save actual compound factor here due to calculating the genesis value from future value.
        // NOTE: The formula is: newCompoundFactor = currentCompoundFactor * (1 / unitPrice).
        Storage.slot().compoundFactors[_ccy] =
            ((Storage.slot().compoundFactors[_ccy] * ProtocolTypes.BP)) /
            _unitPrice;

        Storage.slot().currentMaturity[_ccy] = _nextMaturity;
        Storage.slot().maturityUnitPrices[_ccy][_nextMaturity] = MaturityUnitPrice({
            unitPrice: _unitPrice,
            compoundFactor: Storage.slot().compoundFactors[_ccy],
            prev: _maturity,
            next: 0
        });

        emit CompoundFactorUpdated(
            _ccy,
            Storage.slot().compoundFactors[_ccy],
            _unitPrice,
            _nextMaturity,
            _maturity
        );
    }

    function _addGenesisValue(
        bytes32 _ccy,
        address _account,
        uint256 _basisMaturity,
        int256 _futureValue
    ) internal returns (bool) {
        uint256 compoundFactor = Storage
        .slot()
        .maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;
        int256 amount = (_futureValue * int256(10**decimals(_ccy))) / int256(compoundFactor);
        int256 balance = Storage.slot().balances[_ccy][_account];

        if (amount >= 0) {
            if (balance >= 0) {
                Storage.slot().totalLendingSupplies[_ccy] += uint256(amount);
            } else {
                int256 diff = amount + balance;
                if (diff >= 0) {
                    Storage.slot().totalLendingSupplies[_ccy] += uint256(diff);
                    Storage.slot().totalBorrowingSupplies[_ccy] -= uint256(amount - diff);
                } else {
                    Storage.slot().totalBorrowingSupplies[_ccy] -= uint256(amount);
                }
            }
        } else {
            if (balance <= 0) {
                Storage.slot().totalBorrowingSupplies[_ccy] += uint256(-amount);
            } else {
                int256 diff = amount + balance;
                if (diff <= 0) {
                    Storage.slot().totalBorrowingSupplies[_ccy] += uint256(-diff);
                    Storage.slot().totalLendingSupplies[_ccy] -= uint256(-amount + diff);
                } else {
                    Storage.slot().totalLendingSupplies[_ccy] -= uint256(-amount);
                }
            }
        }

        Storage.slot().balances[_ccy][_account] += amount;

        emit Transfer(_ccy, address(0), _account, amount);

        return true;
    }
}
