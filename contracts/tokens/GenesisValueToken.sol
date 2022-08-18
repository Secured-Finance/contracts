// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IGenesisValueToken} from "../interfaces/IGenesisValueToken.sol";
import {IFutureValueToken} from "../interfaces/IFutureValueToken.sol";
import {MixinAddressResolverV2} from "../mixins/MixinAddressResolverV2.sol";
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {Contracts} from "../libraries/Contracts.sol";
import {Ownable} from "../utils/Ownable.sol";
import {Proxyable} from "../utils/Proxyable.sol";
import {GenesisValueTokenStorage as Storage, MaturityRate} from "../storages/GenesisValueTokenStorage.sol";

/**
 * @title GenesisValueToken contract is used to store the genesis value as a token for Lending deals.
 */
contract GenesisValueToken is MixinAddressResolverV2, IGenesisValueToken, Ownable, Proxyable {
    /**
     * @dev Modifier to check if the market is matured.
     */
    modifier onlyLendingMarket() {
        require(isLendingMarket(msg.sender), "Market is not matured");
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

    function compoundFactorOf(uint256 maturity) public view override returns (uint256) {
        MaturityRate memory maturityRate = Storage.slot().maturityRates[maturity];
        return maturityRate.compoundFactor;
    }

    function futureValueOf(uint256 maturity, int256 futureValueInMaturity)
        external
        view
        override
        returns (int256)
    {
        // NOTE: The formula is:
        // genesisValue = futureValueInMaturity / compoundFactorInMaturity
        // futureValue = genesisValue * currentCompoundFactor.
        return
            (futureValueInMaturity * int256(compoundFactor())) / int256(compoundFactorOf(maturity));
    }

    function getMaturityRate(uint256 maturity)
        external
        view
        override
        returns (MaturityRate memory)
    {
        return Storage.slot().maturityRates[maturity];
    }

    function updateCompoundFactor(
        uint256 maturity,
        uint256 nextMaturity,
        uint256 rate
    ) external onlyAcceptedContracts {
        require(rate != 0, "rate is zero");
        require(Storage.slot().maturityRates[maturity].next == 0, "already updated maturity");
        require(nextMaturity > maturity, "invalid maturity");
        require(Storage.slot().maturityRates[nextMaturity].compoundFactor == 0, "existed maturity");

        if (Storage.slot().initialCompoundFactor == Storage.slot().compoundFactor) {
            Storage.slot().maturityRates[maturity].compoundFactor = Storage.slot().compoundFactor;
        } else {
            require(
                Storage.slot().maturityRates[maturity].compoundFactor != 0,
                "invalid compound factor"
            );
        }

        Storage.slot().maturityRates[maturity].next = nextMaturity;

        // Save actual compound factor here due to calculating the genesis value from future value.
        // NOTE: The formula is: newCompoundFactor = currentCompoundFactor * (1 + rate * (nextMaturity - maturity) / 360 days).
        uint256 dt = nextMaturity - maturity;
        Storage.slot().compoundFactor = ((
            (Storage.slot().compoundFactor *
                (ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR + rate * dt))
        ) / (ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR));
        uint256 actualRate = (rate * dt) / ProtocolTypes.SECONDS_IN_YEAR;

        Storage.slot().maturityRates[nextMaturity] = MaturityRate({
            rate: actualRate,
            compoundFactor: Storage.slot().compoundFactor,
            prev: maturity,
            next: 0
        });

        emit CompoundFactorUpdated(nextMaturity, actualRate);
    }

    // =========== ERC20 FUNCTIONS ===========

    function totalSupply() external view override returns (uint256) {
        return Storage.slot().totalLendingSupply;
    }

    function decimals() public view virtual override returns (uint8) {
        return Storage.slot().decimals;
    }

    function balanceOf(address account) public view virtual returns (int256) {
        return Storage.slot().balances[account];
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

    function isLendingMarket(address account) internal view virtual returns (bool) {
        address[] memory lendingMarkets = lendingMarketController().getLendingMarkets(
            Storage.slot().ccy
        );
        for (uint256 i = 0; i < lendingMarkets.length; i++) {
            if (account == lendingMarkets[i]) {
                return true;
            }
        }

        return false;
    }
}
