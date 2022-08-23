// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IGenesisValueToken} from "../interfaces/IGenesisValueToken.sol";
import {IFutureValueToken} from "../interfaces/IFutureValueToken.sol";
import {MixinAddressResolver} from "../mixins/MixinAddressResolver.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {Contracts} from "../libraries/Contracts.sol";
import {Ownable} from "../utils/Ownable.sol";
import {Proxyable} from "../utils/Proxyable.sol";
import {GenesisValueTokenStorage as Storage, MaturityRate} from "../storages/GenesisValueTokenStorage.sol";

/**
 * @title GenesisValueToken contract is used to store the genesis value as a token for Lending deals.
 */
contract GenesisValueToken is MixinAddressResolver, IGenesisValueToken, Ownable, Proxyable {
    /**
     * @dev Modifier to check if the market is matured.
     */
    modifier onlyLendingMarket() {
        require(isLendingMarket(msg.sender), "Caller is not the lending market");
        _;
    }

    function initialize(
        address _owner,
        address _resolver,
        uint8 _decimals,
        bytes32 _ccy,
        uint256 _compoundFactor
    ) public initializer onlyBeacon {
        require(_compoundFactor != 0, "compound factor is zero");

        Storage.slot().decimals = _decimals;
        Storage.slot().ccy = _ccy;
        Storage.slot().initialCompoundFactor = _compoundFactor;
        Storage.slot().compoundFactor = _compoundFactor;

        _transferOwnership(_owner);
        registerAddressResolver(_resolver);

        buildCache();
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function compoundFactor() public view override returns (uint256) {
        return Storage.slot().compoundFactor;
    }

    function compoundFactorOf(uint256 _maturity) public view override returns (uint256) {
        MaturityRate memory maturityRate = Storage.slot().maturityRates[_maturity];
        return maturityRate.compoundFactor;
    }

    function futureValueOf(uint256 _maturity, int256 _futureValueInMaturity)
        external
        view
        override
        returns (int256)
    {
        // NOTE: The formula is:
        // genesisValue = futureValueInMaturity / compoundFactorInMaturity
        // futureValue = genesisValue * currentCompoundFactor.
        return
            (_futureValueInMaturity * int256(compoundFactor())) /
            int256(compoundFactorOf(_maturity));
    }

    function getMaturityRate(uint256 _maturity)
        external
        view
        override
        returns (MaturityRate memory)
    {
        return Storage.slot().maturityRates[_maturity];
    }

    function updateCompoundFactor(
        uint256 _maturity,
        uint256 _nextMaturity,
        uint256 _rate
    ) external onlyAcceptedContracts {
        require(_rate != 0, "rate is zero");
        require(Storage.slot().maturityRates[_maturity].next == 0, "already updated maturity");
        require(_nextMaturity > _maturity, "invalid maturity");
        require(
            Storage.slot().maturityRates[_nextMaturity].compoundFactor == 0,
            "existed maturity"
        );

        if (Storage.slot().initialCompoundFactor == Storage.slot().compoundFactor) {
            Storage.slot().maturityRates[_maturity].compoundFactor = Storage.slot().compoundFactor;
        } else {
            require(
                Storage.slot().maturityRates[_maturity].compoundFactor != 0,
                "invalid compound factor"
            );
        }

        Storage.slot().maturityRates[_maturity].next = _nextMaturity;

        // Save actual compound factor here due to calculating the genesis value from future value.
        // NOTE: The formula is: newCompoundFactor = currentCompoundFactor * (1 + rate * (nextMaturity - maturity) / 360 days).
        uint256 tenor = _nextMaturity - _maturity;
        Storage.slot().compoundFactor = ((
            (Storage.slot().compoundFactor *
                (ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR + _rate * tenor))
        ) / (ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR));

        Storage.slot().maturityRates[_nextMaturity] = MaturityRate({
            rate: _rate,
            tenor: tenor,
            compoundFactor: Storage.slot().compoundFactor,
            prev: _maturity,
            next: 0
        });

        emit CompoundFactorUpdated(_nextMaturity, _rate, tenor);
    }

    // =========== ERC20 FUNCTIONS ===========

    function totalSupply() external view override returns (uint256) {
        return Storage.slot().totalLendingSupply;
    }

    function decimals() public view virtual override returns (uint8) {
        return Storage.slot().decimals;
    }

    function balanceOf(address _account) public view virtual returns (int256) {
        return Storage.slot().balances[_account];
    }

    function mint(
        address _account,
        uint256 _basisMaturity,
        int256 _futureValue
    ) public onlyLendingMarket returns (bool) {
        // NOTE: The formula is: tokenAmount = featureValue / compoundFactor.
        int256 amount = ((_futureValue * int256(10**decimals())) /
            int256(Storage.slot().maturityRates[_basisMaturity].compoundFactor));

        if (amount >= 0) {
            Storage.slot().totalLendingSupply += uint256(amount);
        } else {
            Storage.slot().totalBorrowingSupply += uint256(-amount);
        }

        Storage.slot().balances[_account] += amount;

        emit Transfer(address(0), _account, amount);

        return true;
    }

    function isLendingMarket(address _account) internal view virtual returns (bool) {
        address[] memory lendingMarkets = lendingMarketController().getLendingMarkets(
            Storage.slot().ccy
        );
        for (uint256 i = 0; i < lendingMarkets.length; i++) {
            if (_account == lendingMarkets[i]) {
                return true;
            }
        }

        return false;
    }
}
