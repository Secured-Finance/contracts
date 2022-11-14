// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {IGenesisValueVault} from "./interfaces/IGenesisValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
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
    event Transfer(bytes32 indexed ccy, address indexed from, address indexed to, int256 value);
    event CompoundFactorUpdated(
        bytes32 indexed ccy,
        uint256 compoundFactor,
        uint256 unitPrice,
        uint256 currentMaturity,
        uint256 previousMaturity
    );

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

    function isRegisteredCurrency(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().isRegisteredCurrency[_ccy];
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
            (getGenesisValue(_ccy, _user) * int256(getCompoundFactor(_ccy))) /
            int256(10**decimals(_ccy));
    }

    function calculateGVFromFV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _futureValue
    ) external view override returns (int256) {
        uint256 compoundFactor = Storage
        .slot()
        .maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");

        // NOTE: The formula is: genesisValue = featureValue / compoundFactor.
        return (_futureValue * int256(10**decimals(_ccy))) / int256(compoundFactor);
    }

    function calculateFVFromGV(
        bytes32 _ccy,
        uint256 _basisMaturity,
        int256 _genesisValue
    ) external view override returns (int256) {
        uint256 compoundFactor = _basisMaturity == 0
            ? getCompoundFactor(_ccy)
            : Storage.slot().maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;

        require(compoundFactor > 0, "Compound factor is not fixed yet");

        return (_genesisValue * int256(compoundFactor)) / int256(10**decimals(_ccy));
    }

    // function _calculatePVFromFV(uint256 _futureValue, uint256 _unitPrice)
    //     internal
    //     pure
    //     returns (uint256)
    // {
    //     // NOTE: The formula is: presentValue = futureValue * unitPrice.
    //     return (_futureValue * _unitPrice) / ProtocolTypes.BP;
    // }

    // function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice)
    //     internal
    //     pure
    //     returns (int256)
    // {
    //     // NOTE: The formula is: presentValue = futureValue * unitPrice.
    //     return (_futureValue * int256(_unitPrice)) / int256(ProtocolTypes.BP);
    // }

    function registerCurrency(
        bytes32 _ccy,
        uint8 _decimals,
        uint256 _compoundFactor
    ) external override onlyAcceptedContracts {
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
        uint256 _unitPrice
    ) external override onlyAcceptedContracts {
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

    function addGenesisValue(
        bytes32 _ccy,
        address _user,
        uint256 _basisMaturity,
        int256 _futureValue
    ) external override onlyAcceptedContracts returns (bool) {
        uint256 compoundFactor = Storage
        .slot()
        .maturityUnitPrices[_ccy][_basisMaturity].compoundFactor;
        int256 amount = (_futureValue * int256(10**decimals(_ccy))) / int256(compoundFactor);
        int256 balance = Storage.slot().balances[_ccy][_user];

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

        Storage.slot().balances[_ccy][_user] += amount;

        emit Transfer(_ccy, address(0), _user, amount);

        return true;
    }
}
