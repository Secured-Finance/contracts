// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {FutureValueStorage as Storage} from "../storages/FutureValueStorage.sol";

/**
 * @title MixinFutureValue contract is used to store the future value as a token for Lending deals.
 */
contract MixinFutureValue {
    event Transfer(address indexed from, address indexed to, int256 value);

    function getTotalLendingSupply(uint256 _maturity) public view returns (uint256) {
        return Storage.slot().totalLendingSupply[_maturity];
    }

    function getTotalBorrowingSupply(uint256 _maturity) public view returns (uint256) {
        return Storage.slot().totalBorrowingSupply[_maturity];
    }

    function getFutureValue(address account) public view returns (int256, uint256) {
        return (Storage.slot().balances[account], Storage.slot().futureValueMaturities[account]);
    }

    function hasFutureValueInPastMaturity(address account, uint256 maturity)
        public
        view
        returns (bool)
    {
        if (Storage.slot().futureValueMaturities[account] == maturity) {
            return false;
        } else {
            return Storage.slot().balances[account] != 0;
        }
    }

    function _addFutureValue(
        address lender,
        address borrower,
        uint256 amount,
        uint256 maturity
    ) internal returns (bool) {
        require(lender != borrower, "borrower and lender are the same");
        require(lender != address(0), "add to the zero address of lender");
        require(borrower != address(0), "add to the zero address of borrower");
        require(
            !hasFutureValueInPastMaturity(lender, maturity),
            "lender has the future value in past maturity"
        );
        require(
            !hasFutureValueInPastMaturity(borrower, maturity),
            "borrower has the future value in past maturity"
        );

        // uint256 maturity = Storage.slot().maturity;
        Storage.slot().futureValueMaturities[lender] = maturity;
        Storage.slot().futureValueMaturities[borrower] = maturity;

        Storage.slot().totalLendingSupply[maturity] += amount;
        Storage.slot().totalBorrowingSupply[maturity] += amount;

        Storage.slot().balances[lender] += int256(amount);
        Storage.slot().balances[borrower] -= int256(amount);

        emit Transfer(address(0), lender, int256(amount));
        emit Transfer(address(0), borrower, -int256(amount));
        return true;
    }

    function _removeFutureValue(address account) internal returns (int256, uint256) {
        int256 balance = Storage.slot().balances[account];
        uint256 maturity = Storage.slot().futureValueMaturities[account];

        if (balance >= 0) {
            Storage.slot().totalLendingSupply[maturity] -= uint256(balance);
        } else {
            Storage.slot().totalBorrowingSupply[maturity] -= uint256(-balance);
        }

        Storage.slot().balances[account] = 0;

        emit Transfer(account, address(0), balance);

        return (balance, maturity);
    }
}
