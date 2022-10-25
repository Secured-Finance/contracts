// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {FutureValueStorage as Storage} from "./storages/FutureValueStorage.sol";
// interfaces
import {IFutureValue} from "./interfaces/IFutureValue.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";

/**
 * @title FutureValue contract is used to store the future value as a token for Lending deals.
 */
contract FutureValue is IFutureValue, Proxyable {
    event Transfer(address indexed from, address indexed to, int256 value);

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

    function getTotalLendingSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalLendingSupply[_maturity];
    }

    function getTotalBorrowingSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalBorrowingSupply[_maturity];
    }

    function getFutureValue(address _account) public view override returns (int256, uint256) {
        return (Storage.slot().balances[_account], Storage.slot().futureValueMaturities[_account]);
    }

    /**
     * @notice Gets the present value calculated from the future value & market rate.
     * @param _user User address
     * @param _rate Target market rate
     * @return The present value
     */
    function getPresentValue(address _user, uint256 _rate) external view override returns (int256) {
        (int256 futureValue, uint256 maturity) = getFutureValue(_user);
        // NOTE: The formula is: presentValue = futureValue / (1 + rate * (maturity - now) / 360 days).
        uint256 dt = maturity >= block.timestamp ? maturity - block.timestamp : 0;

        return ((futureValue * int256(ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR)) /
            int256(ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR + _rate * dt));
    }

    function calculatePresentValue(
        uint256 _futureValue,
        uint256 _maturity,
        uint256 _rate
    ) external view override returns (uint256) {
        // NOTE: The formula is: presentValue = futureValue / (1 + rate * (maturity - now) / 360 days).
        uint256 dt = _maturity >= block.timestamp ? _maturity - block.timestamp : 0;

        return (((_futureValue * ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR) /
            ProtocolTypes.BP) *
            ProtocolTypes.SECONDS_IN_YEAR +
            _rate *
            dt);
    }

    function hasFutureValueInPastMaturity(address account, uint256 maturity)
        public
        view
        override
        returns (bool)
    {
        if (Storage.slot().futureValueMaturities[account] == maturity) {
            return false;
        } else {
            return Storage.slot().balances[account] != 0;
        }
    }

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

    function removeFutureValue(address _user)
        external
        override
        onlyLendingMarket
        returns (int256, uint256)
    {
        int256 balance = Storage.slot().balances[_user];
        uint256 maturity = Storage.slot().futureValueMaturities[_user];

        if (balance >= 0) {
            Storage.slot().totalLendingSupply[maturity] -= uint256(balance);
        } else {
            Storage.slot().totalBorrowingSupply[maturity] -= uint256(-balance);
        }

        Storage.slot().balances[_user] = 0;

        emit Transfer(_user, address(0), balance);

        return (balance, maturity);
    }
}
