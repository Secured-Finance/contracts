// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {FutureValueVaultStorage as Storage} from "./storages/FutureValueVaultStorage.sol";
// interfaces
import {IFutureValueVault} from "./interfaces/IFutureValueVault.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";

/**
 * @notice Implements the management of the future value as an amount for Lending deals in each currency.
 */
contract FutureValueVault is IFutureValueVault, Proxyable {
    /**
     * @notice Modifier to make a function callable only by lending market.
     */
    modifier onlyLendingMarket() {
        require(Storage.slot().lendingMarket == msg.sender, "Caller is not the lending market");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _lendingMarket The address of the Lending Market contract
     */
    function initialize(address _lendingMarket) external initializer onlyBeacon {
        Storage.slot().lendingMarket = _lendingMarket;
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
    ) external override onlyLendingMarket returns (bool) {
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
    ) external override onlyLendingMarket returns (bool) {
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
     * @return maturity Maturity of future value
     */
    function removeFutureValue(address _user, uint256 _activeMaturity)
        external
        override
        onlyLendingMarket
        returns (int256 removedAmount, uint256 maturity)
    {
        if (Storage.slot().futureValueMaturities[_user] != _activeMaturity) {
            removedAmount = Storage.slot().balances[_user];
            maturity = Storage.slot().futureValueMaturities[_user];

            if (removedAmount >= 0) {
                Storage.slot().totalLendingSupply[maturity] -= uint256(removedAmount);
            } else {
                Storage.slot().totalBorrowingSupply[maturity] -= uint256(-removedAmount);
            }

            Storage.slot().balances[_user] = 0;

            emit Transfer(_user, address(0), removedAmount);
        }
    }
}
