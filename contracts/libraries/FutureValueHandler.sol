// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IFutureValueToken} from "../interfaces/IFutureValueToken.sol";
import {MixinAddressResolverV2} from "../mixins/MixinAddressResolverV2.sol";
import {Contracts} from "../libraries/Contracts.sol";
import {Ownable} from "../utils/Ownable.sol";
import {Proxyable} from "../utils/Proxyable.sol";
import {FutureValueStorage as Storage} from "../storages/FutureValueStorage.sol";

/**
 * @title FutureValueHandler library is used to store the future value as a token for Lending deals.
 */
library FutureValueHandler {
    event Transfer(address indexed from, address indexed to, int256 value);

    function getTotalLendingSupply(uint256 _maturity) internal view returns (uint256) {
        return Storage.slot().totalLendingSupply[_maturity];
    }

    function getTotalBorrowingSupply(uint256 _maturity) internal view returns (uint256) {
        return Storage.slot().totalBorrowingSupply[_maturity];
    }

    function getMaturity(address _account) internal view returns (uint256) {
        return Storage.slot().balanceMaturities[_account];
    }

    function getMaturity() internal view returns (uint256) {
        return Storage.slot().maturity;
    }

    function getCcy() internal view returns (bytes32) {
        return Storage.slot().ccy;
    }

    function getBalanceInMaturity(address account) internal view returns (int256, uint256) {
        return (Storage.slot().balances[account], Storage.slot().balanceMaturities[account]);
    }

    function hasPastMaturityBalance(address account) internal view returns (bool) {
        if (Storage.slot().balanceMaturities[account] == Storage.slot().maturity) {
            return false;
        } else {
            return Storage.slot().balances[account] > 0;
        }
    }

    function updateMaturity(uint256 _maturity) internal {
        require(_maturity > Storage.slot().maturity, "old maturity date");
        Storage.slot().maturity = _maturity;
    }

    function add(
        address lender,
        address borrower,
        uint256 amount
    ) internal returns (bool) {
        require(lender != borrower, "borrower and lender are the same");
        require(lender != address(0), "add to the zero address of lender");
        require(borrower != address(0), "add to the zero address of borrower");
        require(!hasPastMaturityBalance(lender), "lender has balance in past maturity");
        require(!hasPastMaturityBalance(borrower), "borrower has balance in past maturity");

        uint256 maturity = Storage.slot().maturity;
        Storage.slot().balanceMaturities[lender] = maturity;
        Storage.slot().balanceMaturities[borrower] = maturity;

        Storage.slot().totalLendingSupply[maturity] += amount;
        Storage.slot().totalBorrowingSupply[maturity] += amount;

        Storage.slot().balances[lender] += int256(amount);
        Storage.slot().balances[borrower] -= int256(amount);

        emit Transfer(address(0), lender, int256(amount));
        emit Transfer(address(0), borrower, -int256(amount));
        return true;
    }

    function remove(address account) internal returns (int256) {
        int256 balance = Storage.slot().balances[account];
        uint256 maturity = Storage.slot().balanceMaturities[account];

        if (balance >= 0) {
            Storage.slot().totalLendingSupply[maturity] -= uint256(balance);
        } else {
            Storage.slot().totalBorrowingSupply[maturity] -= uint256(-balance);
        }

        Storage.slot().balances[account] = 0;

        emit Transfer(account, address(0), balance);

        return balance;
    }
}
