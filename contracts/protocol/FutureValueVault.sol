// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// dependencies
import {SafeCast} from "../dependencies/openzeppelin/utils/math/SafeCast.sol";
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
// storages
import {FutureValueVaultStorage as Storage} from "./storages/FutureValueVaultStorage.sol";

/**
 * @notice Implements the management of the future value as an amount for Lending positions in each currency.
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

    // @inheritdoc Proxyable
    function getRevision() external pure override returns (uint256) {
        return 0x2;
    }

    /**
     * @notice Gets the total supply of lending orders.
     * @dev This function returns the total supply of only orders that have been added
     * through the `increase` of `decrease` function.
     * @param _maturity The maturity of the market
     */
    function getTotalLendingSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalLendingSupplies[_maturity];
    }

    /**
     * @notice Gets the total supply of borrowing orders.
     * @dev This function returns the total supply of only orders that have been added
     * through the `increase` of `decrease` function.
     * @param _maturity The maturity of the market
     */
    function getTotalBorrowingSupply(uint256 _maturity) external view override returns (uint256) {
        return Storage.slot().totalBorrowingSupplies[_maturity];
    }

    /**
     * @notice Gets the user balance.
     * @param _user User's address
     * @return balance The user balance
     * @return maturity The maturity of the market that the future value was added
     */
    function getBalance(
        uint8 _orderBookId,
        address _user
    ) public view override returns (int256 balance, uint256 maturity) {
        return (
            Storage.slot().balances[_orderBookId][_user],
            Storage.slot().balanceMaturities[_orderBookId][_user]
        );
    }

    /**
     * @notice Gets the total locked balance.
     * @param _orderBookId The order book id
     * @return The total locked balance
     */
    function getTotalLockedBalance(uint8 _orderBookId) external view override returns (uint256) {
        return Storage.slot().totalLockedBalances[_orderBookId];
    }

    /**
     * @notice Gets if the account has past maturity balance at the selected maturity.
     * @param _user User's address
     * @param _maturity The maturity of the market
     * @return The boolean if the lending market is initialized or not
     */
    function hasBalanceAtPastMaturity(
        uint8 _orderBookId,
        address _user,
        uint256 _maturity
    ) public view override returns (bool) {
        if (Storage.slot().balanceMaturities[_orderBookId][_user] == _maturity) {
            return false;
        } else {
            return Storage.slot().balances[_orderBookId][_user] != 0;
        }
    }

    /**
     * @notice Increases amount for lending deals.
     * @dev Since the total supply can be determined by totaling only the amounts on one side of the order
     * when the order is fulfilled, the total supply is incremented only when the executor of the original order
     * is the taker.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     */
    function increase(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) public override onlyLendingMarketController {
        if (_user == address(0)) revert UserIsZero();
        if (hasBalanceAtPastMaturity(_orderBookId, _user, _maturity))
            revert PastMaturityBalanceExists({user: _user});

        int256 previousBalance = Storage.slot().balances[_orderBookId][_user];
        Storage.slot().balanceMaturities[_orderBookId][_user] = _maturity;
        Storage.slot().balances[_orderBookId][_user] += _amount.toInt256();
        emit Transfer(address(0), _user, _orderBookId, _maturity, _amount.toInt256());

        _updateTotalSupply(_maturity, _amount.toInt256(), previousBalance);
    }

    /**
     * @notice Decreases amount for borrowing deals.
     * @dev Since the total supply can be determined by totaling only the amounts on one side of the order
     * when the order is fulfilled, the total supply is incremented only when the executor of the original order
     * is the taker.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     */
    function decrease(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) public override onlyLendingMarketController {
        if (_user == address(0)) revert UserIsZero();
        if (hasBalanceAtPastMaturity(_orderBookId, _user, _maturity))
            revert PastMaturityBalanceExists({user: _user});

        int256 previousBalance = Storage.slot().balances[_orderBookId][_user];
        Storage.slot().balanceMaturities[_orderBookId][_user] = _maturity;
        Storage.slot().balances[_orderBookId][_user] -= _amount.toInt256();
        emit Transfer(address(0), _user, _orderBookId, _maturity, -(_amount.toInt256()));

        _updateTotalSupply(_maturity, -_amount.toInt256(), previousBalance);
    }

    /**
     * @notice Locks user's balance.
     * @param _user User's address
     * @param _amount The amount to lock
     * @param _maturity The maturity of the market
     * @return lockedAmount The amount locked
     */
    function lock(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) public override onlyLendingMarketController returns (uint256 lockedAmount) {
        int256 balance = Storage.slot().balances[_orderBookId][_user];

        if (balance <= 0) revert InsufficientBalance();

        lockedAmount = _amount == 0 ? balance.toUint256() : _amount;

        if (balance.toUint256() < lockedAmount) revert InsufficientBalance();

        Storage.slot().balances[_orderBookId][_user] -= lockedAmount.toInt256();
        Storage.slot().totalLockedBalances[_orderBookId] += lockedAmount;

        emit BalanceLocked(_orderBookId, _maturity, _user, lockedAmount);
    }

    /**
     * @notice Unlocks user's balance.
     * @param _user User's address
     * @param _amount The amount to lock
     * @param _maturity The maturity of the market
     */
    function unlock(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity
    ) public override onlyLendingMarketController {
        if (_amount > Storage.slot().totalLockedBalances[_orderBookId]) {
            revert InsufficientLockedBalance();
        }

        Storage.slot().totalLockedBalances[_orderBookId] -= _amount;
        Storage.slot().balances[_orderBookId][_user] += _amount.toInt256();

        emit BalanceUnlocked(_orderBookId, _maturity, _user, _amount);
    }

    /**
     * @notice Transfers the future value from sender to receiver.
     * @param _sender Sender's address
     * @param _receiver Receiver's address
     * @param _amount Amount of funds to sent
     * @param _maturity The maturity of the market
     */
    function transferFrom(
        uint8 _orderBookId,
        address _sender,
        address _receiver,
        int256 _amount,
        uint256 _maturity
    ) external override onlyLendingMarketController {
        if (hasBalanceAtPastMaturity(_orderBookId, _sender, _maturity))
            revert PastMaturityBalanceExists({user: _sender});
        if (hasBalanceAtPastMaturity(_orderBookId, _receiver, _maturity))
            revert PastMaturityBalanceExists({user: _receiver});

        Storage.slot().balanceMaturities[_orderBookId][_receiver] = _maturity;
        Storage.slot().balances[_orderBookId][_sender] -= _amount;
        Storage.slot().balances[_orderBookId][_receiver] += _amount;

        emit Transfer(_sender, _receiver, _orderBookId, _maturity, _amount);
    }

    /**
     * @notice Reset all amount if there is an amount in the past maturity.
     * @param _user User's address
     * @return removedAmount Removed future value amount
     * @return currentAmount Current future value amount after update
     * @return maturity Maturity of future value
     * @return isAllRemoved The boolean if the all future value amount in the selected maturity is removed
     */
    function reset(
        uint8 _orderBookId,
        address _user
    )
        external
        override
        onlyLendingMarketController
        returns (int256 removedAmount, int256 currentAmount, uint256 maturity, bool isAllRemoved)
    {
        currentAmount = Storage.slot().balances[_orderBookId][_user];
        maturity = Storage.slot().balanceMaturities[_orderBookId][_user];

        if (maturity < block.timestamp && currentAmount != 0) {
            removedAmount = currentAmount;

            isAllRemoved = false;
            if (removedAmount >= 0) {
                Storage.slot().removedLendingSupply[maturity] += removedAmount.toUint256();
            } else {
                Storage.slot().removedBorrowingSupply[maturity] += (-removedAmount).toUint256();
            }

            Storage.slot().balances[_orderBookId][_user] = 0;
            currentAmount = 0;

            emit Transfer(_user, address(0), _orderBookId, maturity, removedAmount);
        }

        isAllRemoved =
            (Storage.slot().removedLendingSupply[maturity] ==
                Storage.slot().totalLendingSupplies[maturity]) &&
            (Storage.slot().removedBorrowingSupply[maturity] ==
                Storage.slot().totalBorrowingSupplies[maturity]);
    }

    /**
     * @notice Forces a reset of the user's future value.
     * @param _user User's address
     */
    function executeForcedReset(
        uint8 _orderBookId,
        address _user
    ) external override onlyLendingMarketController {
        int256 removedAmount = Storage.slot().balances[_orderBookId][_user];

        if (removedAmount != 0) {
            Storage.slot().balances[_orderBookId][_user] = 0;
            uint256 maturity = Storage.slot().balanceMaturities[_orderBookId][_user];

            emit Transfer(_user, address(0), _orderBookId, maturity, removedAmount);
        }
    }

    /**
     * @notice Forces a reset of the user's future value.
     * @param _user User's address
     * @param _amount The amount to reset
     */
    function executeForcedReset(
        uint8 _orderBookId,
        address _user,
        int256 _amount
    ) external override onlyLendingMarketController returns (int256 removedAmount, int256 balance) {
        removedAmount = Storage.slot().balances[_orderBookId][_user];

        if ((_amount > 0 && removedAmount < 0) || (_amount < 0 && removedAmount > 0)) {
            revert InvalidResetAmount();
        }

        if ((_amount > 0 && _amount < removedAmount) || (_amount < 0 && _amount > removedAmount)) {
            removedAmount = _amount;
        }

        if (removedAmount != 0) {
            Storage.slot().balances[_orderBookId][_user] -= removedAmount;
            uint256 maturity = Storage.slot().balanceMaturities[_orderBookId][_user];

            emit Transfer(_user, address(0), _orderBookId, maturity, removedAmount);
        }

        balance = Storage.slot().balances[_orderBookId][_user];
    }

    function _updateTotalSupply(uint256 _maturity, int256 _amount, int256 _balance) private {
        if (_amount >= 0) {
            uint256 absAmount = _amount.toUint256();
            if (_balance >= 0) {
                Storage.slot().totalLendingSupplies[_maturity] += absAmount;
            } else {
                int256 diff = _amount + _balance;
                if (diff >= 0) {
                    Storage.slot().totalLendingSupplies[_maturity] += diff.toUint256();
                    Storage.slot().totalBorrowingSupplies[_maturity] -= (-_balance).toUint256();
                } else {
                    Storage.slot().totalBorrowingSupplies[_maturity] -= absAmount;
                }
            }
        } else {
            uint256 absAmount = (-_amount).toUint256();
            if (_balance <= 0) {
                Storage.slot().totalBorrowingSupplies[_maturity] += absAmount;
            } else {
                int256 diff = _amount + _balance;
                if (diff <= 0) {
                    Storage.slot().totalBorrowingSupplies[_maturity] += (-diff).toUint256();
                    Storage.slot().totalLendingSupplies[_maturity] -= _balance.toUint256();
                } else {
                    Storage.slot().totalLendingSupplies[_maturity] -= absAmount;
                }
            }
        }
    }
}
