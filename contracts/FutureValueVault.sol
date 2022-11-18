// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {FutureValueVaultStorage as Storage} from "./storages/FutureValueVaultStorage.sol";
// interfaces
import {IFutureValueVault} from "./interfaces/IFutureValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";

/**
 * @notice Implements the management of the future value as an amount for Lending deals in each currency.
 */
contract FutureValueVault is IFutureValueVault, MixinAddressResolver, Proxyable {
    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _resolver The address of the Address Resolver contract
     */
    function initialize(address _resolver) external initializer onlyBeacon {
        registerAddressResolver(_resolver);
        buildCache();
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

    /**
     * @notice Gets the total lending supply.
     * @param _maturity The maturity of the market
     */
    function getTotalLendingSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalLendingSupply[_maturity];
    }

    /**
     * @notice Gets the total borrowing supply.
     * @param _maturity The maturity of the market
     */
    function getTotalBorrowingSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalBorrowingSupply[_maturity];
    }

    /**
     * @notice Gets the future value of the account.
     * @param _user User's address
     * @return futureValue The future value
     * @return maturity The maturity of the market that the future value was added
     */
    function getFutureValue(address _user)
        public
        view
        override
        returns (int256 futureValue, uint256 maturity)
    {
        return (Storage.slot().balances[_user], Storage.slot().futureValueMaturities[_user]);
    }

    /**
     * @notice Gets if the account has the future value amount in the selected maturity.
     * @param _user User's address
     * @param _maturity The maturity of the market
     * @return The boolean if the lending market is initialized or not
     */
    function hasFutureValueInPastMaturity(address _user, uint256 _maturity)
        public
        view
        override
        returns (bool)
    {
        if (Storage.slot().futureValueMaturities[_user] == _maturity) {
            return false;
        } else {
            return Storage.slot().balances[_user] != 0;
        }
    }

    /**
     * @notice Adds the future value amount for borrowing deals.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     */
    function addBorrowFutureValue(
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) external override onlyAcceptedContracts returns (bool) {
        require(_user != address(0), "add to the zero address of borrower");
        require(
            !hasFutureValueInPastMaturity(_user, _maturity),
            "borrower has the future value in past maturity"
        );

        Storage.slot().futureValueMaturities[_user] = _maturity;
        Storage.slot().totalBorrowingSupply[_maturity] += _amount;
        Storage.slot().balances[_user] -= int256(_amount);
        emit Transfer(address(0), _user, -int256(_amount));

        return true;
    }

    /**
     * @notice Adds the future value amount for lending deals.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     */
    function addLendFutureValue(
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) external override onlyAcceptedContracts returns (bool) {
        require(_user != address(0), "add to the zero address of lender");
        require(
            !hasFutureValueInPastMaturity(_user, _maturity),
            "lender has the future value in past maturity"
        );

        Storage.slot().futureValueMaturities[_user] = _maturity;
        Storage.slot().totalLendingSupply[_maturity] += _amount;
        Storage.slot().balances[_user] += int256(_amount);
        emit Transfer(address(0), _user, int256(_amount));

        return true;
    }

    /**
     * @notice Remove all future values if there is an amount in the past maturity.
     * @param _user User's address
     * @return removedAmount Removed future value amount
     * @return currentAmount Current future value amount after update
     * @return maturity Maturity of future value
     */
    function removeFutureValue(address _user, uint256 _activeMaturity)
        external
        override
        onlyAcceptedContracts
        returns (
            int256 removedAmount,
            int256 currentAmount,
            uint256 maturity
        )
    {
        currentAmount = Storage.slot().balances[_user];

        if (Storage.slot().futureValueMaturities[_user] != _activeMaturity && currentAmount != 0) {
            removedAmount = currentAmount;
            maturity = Storage.slot().futureValueMaturities[_user];

            if (removedAmount >= 0) {
                Storage.slot().totalLendingSupply[maturity] -= uint256(removedAmount);
            } else {
                Storage.slot().totalBorrowingSupply[maturity] -= uint256(-removedAmount);
            }

            Storage.slot().balances[_user] = 0;
            currentAmount = 0;

            emit Transfer(_user, address(0), removedAmount);
        }
    }
}
