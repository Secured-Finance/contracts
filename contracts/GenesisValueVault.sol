// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

// interfaces
import {IGenesisValueVault} from "./interfaces/IGenesisValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {RoundingUint256} from "./libraries/math/RoundingUint256.sol";
import {RoundingInt256} from "./libraries/math/RoundingInt256.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// utils
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {GenesisValueVaultStorage as Storage, MaturityUnitPrice} from "./storages/GenesisValueVaultStorage.sol";

/**
 * @notice Implements the management of the genesis value as an amount for Lending deals.
 */
contract GenesisValueVault is IGenesisValueVault, MixinAddressResolver, Proxyable {
    using SafeCast for uint256;
    using SafeCast for int256;
    using RoundingUint256 for uint256;
    using RoundingInt256 for int256;

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _resolver The address of the Address Resolver contract
     */
    function initialize(address _resolver) public initializer onlyProxy {
        registerAddressResolver(_resolver);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function isInitialized(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().isInitialized[_ccy];
    }

    function decimals(bytes32 _ccy) public view override returns (uint8) {
        return Storage.slot().decimals[_ccy];
    }

    function getTotalLendingSupply(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().totalLendingSupplies[_ccy];
    }

    function getTotalBorrowingSupply(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().totalBorrowingSupplies[_ccy];
    }

    function getGenesisValue(bytes32 _ccy, address _user) public view override returns (int256) {
        return Storage.slot().balances[_ccy][_user];
    }

    function getMaturityGenesisValue(bytes32 _ccy, uint256 _maturity)
        external
        view
        override
        returns (int256)
    {
        return Storage.slot().maturityBalances[_ccy][_maturity];
    }

    function getCurrentMaturity(bytes32 _ccy) public view override returns (uint256) {
        return Storage.slot().currentMaturity[_ccy];
    }

    function getCompoundFactor(bytes32 _ccy) public view override returns (uint256) {
        return Storage.slot().compoundFactors[_ccy];
    }

    function getMaturityUnitPrice(bytes32 _ccy, uint256 _maturity)
        public
        view
        override
        returns (MaturityUnitPrice memory)
    {
        return Storage.slot().maturityUnitPrices[_ccy][_maturity];
    }

    function getGenesisValueInFutureValue(bytes32 _ccy, address _user)
        public
        view
        override
        returns (int256)
    {
        // NOTE: The formula is:
        // futureValue = genesisValue * currentCompoundFactor.
        return
            (getGenesisValue(_ccy, _user) * getCompoundFactor(_ccy).toInt256()).div(
                (10**decimals(_ccy)).toInt256()
            );
    }

    function calculateCurrentFVFromFVInMaturity(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _futureValue
    ) external view override returns (int256) {
        if (_futureValue == 0) {
            return 0;
        } else {
            // NOTE: These calculation steps "FV -> GV -> FV" are needed to match the actual conversion step.
            // Otherwise, Solidity's truncation specification creates a difference in the calculated values.
            // The formula is:
            // genesisValue = featureValueInMaturity / compoundFactorInMaturity.
            // currentFeatureValue = genesisValue * currentCompoundFactor
            int256 genesisValue = calculateGVFromFV(_ccy, _basisMaturity, _futureValue);
            return calculateFVFromGV(_ccy, Storage.slot().currentMaturity[_ccy], genesisValue);
        }
    }

    function calculateGVFromFV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _futureValue
    ) public view override returns (int256) {
        uint256 compoundFactor = _basisMaturity == Storage.slot().currentMaturity[_ccy]
            ? getCompoundFactor(_ccy)
            : Storage.slot().maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");

        // NOTE: The formula is: genesisValue = featureValue / compoundFactor.
        bool isPlus = _futureValue > 0;
        uint256 absFv = (isPlus ? _futureValue : -_futureValue).toUint256();
        uint256 absGv = (absFv * 10**decimals(_ccy)).div(compoundFactor);
        return isPlus ? absGv.toInt256() : -(absGv.toInt256());
    }

    function calculateFVFromGV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _genesisValue
    ) public view override returns (int256) {
        uint256 compoundFactor = _basisMaturity == Storage.slot().currentMaturity[_ccy]
            ? getCompoundFactor(_ccy)
            : Storage.slot().maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");
        bool isPlus = _genesisValue > 0;
        uint256 absGv = (isPlus ? _genesisValue : -_genesisValue).toUint256();
        uint256 absFv = (absGv * compoundFactor).div(10**decimals(_ccy));

        return isPlus ? absFv.toInt256() : -(absFv.toInt256());
    }

    function initialize(
        bytes32 _ccy,
        uint8 _decimals,
        uint256 _compoundFactor,
        uint256 _maturity
    ) external override onlyAcceptedContracts {
        require(_compoundFactor != 0, "Compound factor is zero");
        require(!isInitialized(_ccy), "Already initialized currency");

        Storage.slot().isInitialized[_ccy] = true;
        Storage.slot().decimals[_ccy] = _decimals;
        Storage.slot().initialCompoundFactors[_ccy] = _compoundFactor;
        Storage.slot().compoundFactors[_ccy] = _compoundFactor;
        Storage.slot().currentMaturity[_ccy] = _maturity;
    }

    function executeAutoRoll(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _unitPrice,
        uint256 _totalFVAmount
    ) external override onlyAcceptedContracts {
        _updateCompoundFactor(_ccy, _maturity, _nextMaturity, _unitPrice);
        _registerMaximumTotalSupply(_ccy, _maturity, _totalFVAmount);
    }

    function _updateCompoundFactor(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _unitPrice
    ) private {
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
            ((Storage.slot().compoundFactors[_ccy] * ProtocolTypes.PRICE_DIGIT)) /
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

    function updateGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _basisMaturity,
        int256 _fvAmount
    ) external override onlyAcceptedContracts returns (bool) {
        int256 amount = calculateGVFromFV(_ccy, _basisMaturity, _fvAmount);

        if (amount > 0) {
            return addLendGenesisValue(_ccy, _user, _basisMaturity, amount.toUint256());
        } else {
            return addBorrowGenesisValue(_ccy, _user, _basisMaturity, (-amount).toUint256());
        }
    }

    function addLendGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _maturity,
        uint256 _absAmount
    ) public override onlyAcceptedContracts returns (bool) {
        int256 balance = Storage.slot().balances[_ccy][_user];
        int256 amount = _absAmount.toInt256();

        if (balance >= 0) {
            Storage.slot().totalLendingSupplies[_ccy] += _absAmount;
        } else {
            int256 diff = amount + balance;
            if (diff >= 0) {
                Storage.slot().totalLendingSupplies[_ccy] += diff.toUint256();
                Storage.slot().totalBorrowingSupplies[_ccy] -= (-balance).toUint256();
            } else {
                Storage.slot().totalBorrowingSupplies[_ccy] -= _absAmount;
            }
        }

        Storage.slot().balances[_ccy][_user] += amount;
        Storage.slot().maturityBalances[_ccy][_maturity] += amount;

        emit Transfer(_ccy, address(0), _user, amount);

        return true;
    }

    function addBorrowGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _maturity,
        uint256 _absAmount
    ) public override onlyAcceptedContracts returns (bool) {
        int256 balance = Storage.slot().balances[_ccy][_user];
        int256 amount = -(_absAmount.toInt256());

        if (balance <= 0) {
            Storage.slot().totalBorrowingSupplies[_ccy] += _absAmount;
        } else {
            int256 diff = amount + balance;
            if (diff <= 0) {
                Storage.slot().totalBorrowingSupplies[_ccy] += (-diff).toUint256();
                Storage.slot().totalLendingSupplies[_ccy] -= balance.toUint256();
            } else {
                Storage.slot().totalLendingSupplies[_ccy] -= _absAmount;
            }
        }

        Storage.slot().balances[_ccy][_user] += amount;
        Storage.slot().maturityBalances[_ccy][_maturity] += amount;

        emit Transfer(_ccy, address(0), _user, amount);

        return true;
    }

    function _registerMaximumTotalSupply(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 totalFVAmount
    ) private {
        require(Storage.slot().maximumTotalSupply[_ccy][_maturity] == 0, "Already registered");

        Storage.slot().maximumTotalSupply[_ccy][_maturity] = (totalFVAmount * 10**decimals(_ccy))
            .div(getCompoundFactor(_ccy));
    }
}
