// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
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
    using SafeCast for uint256;
    using SafeCast for int256;

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
     * @notice Gets the total supply.
     * @param _maturity The maturity of the market
     */
    function getTotalSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalSupply[_maturity];
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
     * @notice Adds the future value amount for lending deals.
     * @dev Since the total supply can be determined by totaling only the amounts on one side of the order
     * when the order is fulfilled, the total supply is incremented only when the executor of the original order
     * is the taker.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     * @param _isTaker The boolean if the original order is created by a taker
     */
    function addLendFutureValue(
        address _user,
        uint256 _amount,
        uint256 _maturity,
        bool _isTaker
    ) public override onlyAcceptedContracts returns (bool) {
        require(_user != address(0), "add to the zero address of lender");
        require(
            !hasFutureValueInPastMaturity(_user, _maturity),
            "lender has the future value in past maturity"
        );

        int256 previousBalance = Storage.slot().balances[_user];
        Storage.slot().futureValueMaturities[_user] = _maturity;
        Storage.slot().balances[_user] += _amount.toInt256();
        emit Transfer(address(0), _user, _amount.toInt256());

        if (_isTaker) {
            int256 currentBalance = Storage.slot().balances[_user];
            _updateTotalSupply(_maturity, previousBalance, currentBalance);
        }

        return true;
    }

    /**
     * @notice Adds the future value amount for borrowing deals.
     * @dev Since the total supply can be determined by totaling only the amounts on one side of the order
     * when the order is fulfilled, the total supply is incremented only when the executor of the original order
     * is the taker.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     * @param _isTaker The boolean if the original order is created by a taker
     */
    function addBorrowFutureValue(
        address _user,
        uint256 _amount,
        uint256 _maturity,
        bool _isTaker
    ) public override onlyAcceptedContracts returns (bool) {
        require(_user != address(0), "add to the zero address of borrower");
        require(
            !hasFutureValueInPastMaturity(_user, _maturity),
            "borrower has the future value in past maturity"
        );

        int256 previousBalance = Storage.slot().balances[_user];
        Storage.slot().futureValueMaturities[_user] = _maturity;
        Storage.slot().balances[_user] -= _amount.toInt256();
        emit Transfer(address(0), _user, -(_amount.toInt256()));

        if (_isTaker) {
            int256 currentBalance = Storage.slot().balances[_user];
            _updateTotalSupply(_maturity, previousBalance, currentBalance);
        }

        return true;
    }

    function offsetFutureValue(
        address _lender,
        address _borrower,
        uint256 _maximumFVAmount
    ) external override onlyAcceptedContracts returns (uint256 offsetAmount) {
        (int256 lenderFVAmount, uint256 lenderMaturity) = getFutureValue(_lender);
        (int256 borrowerFVAmount, uint256 borrowerMaturity) = getFutureValue(_borrower);

        if (lenderFVAmount <= 0 || borrowerFVAmount >= 0) {
            return 0;
        }

        if (lenderMaturity == borrowerMaturity) {
            offsetAmount = lenderFVAmount.toUint256();

            if (-borrowerFVAmount < lenderFVAmount) {
                offsetAmount = (-borrowerFVAmount).toUint256();
            }

            if (_maximumFVAmount != 0 && offsetAmount > _maximumFVAmount) {
                offsetAmount = _maximumFVAmount;
            }

            addBorrowFutureValue(_lender, offsetAmount, lenderMaturity, false);
            addLendFutureValue(_borrower, offsetAmount, lenderMaturity, false);
            Storage.slot().totalSupply[lenderMaturity] -= offsetAmount;
        }
    }

    /**
     * @notice Remove all future values if there is an amount in the past maturity.
     * @param _user User's address
     * @return removedAmount Removed future value amount
     * @return currentAmount Current future value amount after update
     * @return maturity Maturity of future value
     * @return isAllRemoved The boolean if the all future value amount in the selected maturity is removed
     */
    function removeFutureValue(address _user, uint256 _activeMaturity)
        external
        override
        onlyAcceptedContracts
        returns (
            int256 removedAmount,
            int256 currentAmount,
            uint256 maturity,
            bool isAllRemoved
        )
    {
        currentAmount = Storage.slot().balances[_user];

        if (Storage.slot().futureValueMaturities[_user] != _activeMaturity && currentAmount != 0) {
            removedAmount = currentAmount;
            maturity = Storage.slot().futureValueMaturities[_user];

            isAllRemoved = false;
            if (removedAmount >= 0) {
                Storage.slot().removedLendingSupply[maturity] += removedAmount.toUint256();
            } else {
                Storage.slot().removedBorrowingSupply[maturity] += (-removedAmount).toUint256();
            }

            Storage.slot().balances[_user] = 0;
            currentAmount = 0;

            emit Transfer(_user, address(0), removedAmount);
        }

        isAllRemoved =
            Storage.slot().removedLendingSupply[maturity] == Storage.slot().totalSupply[maturity] &&
            Storage.slot().removedBorrowingSupply[maturity] == Storage.slot().totalSupply[maturity];
    }

    function addInitialTotalSupply(uint256 _maturity, int256 _amount)
        external
        override
        onlyAcceptedContracts
    {
        require(Storage.slot().totalSupply[_maturity] == 0, "initial total supply is not 0");
        _updateTotalSupply(_maturity, 0, _amount);
    }

    function _updateTotalSupply(
        uint256 _maturity,
        int256 _previous,
        int256 _current
    ) private {
        uint256 absPrevious = _previous >= 0 ? _previous.toUint256() : (-_previous).toUint256();
        uint256 absCurrent = _current >= 0 ? _current.toUint256() : (-_current).toUint256();

        if (absPrevious > absCurrent) {
            Storage.slot().totalSupply[_maturity] -= absPrevious - absCurrent;
        } else {
            Storage.slot().totalSupply[_maturity] += absCurrent - absPrevious;
        }
    }
}
