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
    function initialize(
        address _owner,
        address _resolver,
        bytes32 _ccy,
        uint256 _compoundFactor
    ) public initializer onlyBeacon {
        Storage.slot().ccy = _ccy;
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

    function addFvToken(address _fvToken, bool _isRegistered) external onlyAcceptedContracts {
        IFutureValueToken fvToken = IFutureValueToken(_fvToken);
        require(fvToken.getCcy() == Storage.slot().ccy, "unsupported currency");
        Storage.slot().fvTokens[_fvToken] = _isRegistered;
    }

    function compoundFactor() public view override returns (uint256) {
        return Storage.slot().compoundFactor;
    }

    function compoundFactorOf(uint256 maturity) public view override returns (uint256) {
        MaturityRate memory maturityRate = Storage.slot().maturityRates[maturity];
        return maturityRate.compoundFactor;
    }

    function presentValueOf(
        uint256 maturity,
        uint256 rate,
        int256 futureValue
    ) external view override returns (int256) {
        // NOTE: The formula is:
        // genesisValue = futureValueInMaturity / compoundFactorInMaturity
        // presentValue = genesisValue * currentCompoundFactor / (1 + rate).
        return
            ((futureValue * int256(compoundFactor() * ProtocolTypes.BP))) /
            int256(compoundFactorOf(maturity) * (ProtocolTypes.BP + rate));
    }

    function updateCompoundFactor(
        uint256 maturity,
        uint256 nextMaturity,
        uint256 rate
    ) external onlyAcceptedContracts {
        require(rate != 0, "rate is zero");
        require(
            Storage.slot().maturityRates[maturity].compoundFactor != 0 &&
                Storage.slot().maturityRates[maturity].next == 0,
            "invalid maturity"
        );
        require(Storage.slot().maturityRates[nextMaturity].compoundFactor == 0, "existed maturity");

        // Save actual compound factor here due to calculating the genesis value from future value.
        // NOTE: The formula is: newCompoundFactor = currentCompoundFactor * (1 + rate).
        Storage.slot().compoundFactor =
            (Storage.slot().compoundFactor * (ProtocolTypes.BP + rate)) /
            ProtocolTypes.BP;

        Storage.slot().maturityRates[maturity].next = nextMaturity;
        Storage.slot().maturityRates[nextMaturity] = MaturityRate({
            rate: rate,
            compoundFactor: Storage.slot().compoundFactor,
            prev: maturity,
            next: 0
        });

        emit CompoundFactorUpdated(nextMaturity, rate);
    }

    // =========== ERC20 FUNCTIONS ===========

    function totalSupply() external view returns (uint256) {
        return Storage.slot().totalLendingSupply;
    }

    function balanceOf(address account) public view virtual returns (int256) {
        return Storage.slot().balances[account];
    }

    function mint(address _fvToken, address _account) public onlyAcceptedContracts returns (bool) {
        require(Storage.slot().fvTokens[_fvToken], "unsupported token");

        IFutureValueToken fvToken = IFutureValueToken(_fvToken);
        uint256 accountMaturity = fvToken.getMaturity(_account);
        int256 fvTokenAmount = fvToken.burnFrom(_account);

        // NOTE: The formula is: tokenAmount = featureValue / compoundFactor.
        int256 amount = ((fvTokenAmount * int256(ProtocolTypes.BP)) /
            int256(Storage.slot().maturityRates[accountMaturity].compoundFactor));

        if (amount >= 0) {
            Storage.slot().totalLendingSupply += uint256(amount);
        } else {
            Storage.slot().totalBorrowingSupply += uint256(-amount);
        }

        Storage.slot().balances[_account] += amount;

        emit Transfer(address(0), _account, amount);

        return true;
    }
}
