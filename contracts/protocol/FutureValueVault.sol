// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
     * @notice Gets the user balance.
     * @param _user User's address
     * @return balance The user balance
     * @return maturity The maturity of the market that the future value was added
     */
    function getBalance(uint8 _orderBookId, address _user)
        public
        view
        override
        returns (int256 balance, uint256 maturity)
    {
        return (
            Storage.slot().balances[_orderBookId][_user],
            Storage.slot().balanceMaturities[_orderBookId][_user]
        );
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
     * @param _isTaker The boolean if the original order is created by a taker
     */
    function increase(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity,
        bool _isTaker
    ) public override onlyAcceptedContracts {
        require(_user != address(0), "Add to the zero address of lender");
        require(
            !hasBalanceAtPastMaturity(_orderBookId, _user, _maturity),
            "User has past maturity balance"
        );

        int256 previousBalance = Storage.slot().balances[_orderBookId][_user];
        Storage.slot().balanceMaturities[_orderBookId][_user] = _maturity;
        Storage.slot().balances[_orderBookId][_user] += _amount.toInt256();
        emit Transfer(address(0), _user, _orderBookId, _maturity, _amount.toInt256());

        int256 currentBalance = Storage.slot().balances[_orderBookId][_user];
        _updateTotalSupply(_maturity, previousBalance, currentBalance, _isTaker);
    }

    /**
     * @notice Decreases amount for borrowing deals.
     * @dev Since the total supply can be determined by totaling only the amounts on one side of the order
     * when the order is fulfilled, the total supply is incremented only when the executor of the original order
     * is the taker.
     * @param _user User's address
     * @param _amount The amount to add
     * @param _maturity The maturity of the market
     * @param _isTaker The boolean if the original order is created by a taker
     */
    function decrease(
        uint8 _orderBookId,
        address _user,
        uint256 _amount,
        uint256 _maturity,
        bool _isTaker
    ) public override onlyAcceptedContracts {
        require(_user != address(0), "Add to the zero address of borrower");
        require(
            !hasBalanceAtPastMaturity(_orderBookId, _user, _maturity),
            "User has past maturity balance"
        );

        int256 previousBalance = Storage.slot().balances[_orderBookId][_user];
        Storage.slot().balanceMaturities[_orderBookId][_user] = _maturity;
        Storage.slot().balances[_orderBookId][_user] -= _amount.toInt256();
        emit Transfer(address(0), _user, _orderBookId, _maturity, -(_amount.toInt256()));

        int256 currentBalance = Storage.slot().balances[_orderBookId][_user];
        _updateTotalSupply(_maturity, previousBalance, currentBalance, _isTaker);
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
    ) external override onlyAcceptedContracts {
        require(
            !hasBalanceAtPastMaturity(_orderBookId, _sender, _maturity),
            "Sender has past maturity balance"
        );
        require(
            !hasBalanceAtPastMaturity(_orderBookId, _receiver, _maturity),
            "Receiver has past maturity balance"
        );

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
        address _user,
        uint256 _activeMaturity
    )
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
        currentAmount = Storage.slot().balances[_orderBookId][_user];

        if (
            Storage.slot().balanceMaturities[_orderBookId][_user] != _activeMaturity &&
            currentAmount != 0
        ) {
            removedAmount = currentAmount;
            maturity = Storage.slot().balanceMaturities[_orderBookId][_user];

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
            Storage.slot().removedLendingSupply[maturity] == Storage.slot().totalSupply[maturity] &&
            Storage.slot().removedBorrowingSupply[maturity] == Storage.slot().totalSupply[maturity];
    }

    /**
     * @notice Sets initial total supply at market opening
     * @param _maturity The maturity of the market
     * @param _amount The amount to add
     */
    function setInitialTotalSupply(uint256 _maturity, int256 _amount)
        external
        override
        onlyAcceptedContracts
    {
        require(Storage.slot().totalSupply[_maturity] == 0, "Initial total supply is not 0");
        _updateTotalSupply(_maturity, 0, _amount, true);
    }

    /**
     * @notice Forces a reset of the user's future value.
     * @param _user User's address
     */
    function executeForcedReset(uint8 _orderBookId, address _user)
        external
        override
        onlyAcceptedContracts
    {
        int256 removedAmount = Storage.slot().balances[_orderBookId][_user];

        if (removedAmount != 0) {
            Storage.slot().balances[_orderBookId][_user] -= removedAmount;
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
    ) external override onlyAcceptedContracts returns (int256 removedAmount, int256 balance) {
        removedAmount = Storage.slot().balances[_orderBookId][_user];

        require(
            (_amount > 0 && removedAmount >= 0) || (_amount < 0 && removedAmount <= 0),
            "Invalid amount"
        );

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

    function _updateTotalSupply(
        uint256 _maturity,
        int256 _previous,
        int256 _current,
        bool _isTaker
    ) private {
        uint256 absPrevious = _previous >= 0 ? _previous.toUint256() : (-_previous).toUint256();
        uint256 absCurrent = _current >= 0 ? _current.toUint256() : (-_current).toUint256();

        // Since total supply can be calculated only by taker amount, total supply will not be increased by maker amount.
        // However, if a maker has an offset volume when cleaning up its own orders, the total supply must be reduced.
        if (absPrevious > absCurrent) {
            Storage.slot().totalSupply[_maturity] -= absPrevious - absCurrent;
        } else if (_isTaker) {
            Storage.slot().totalSupply[_maturity] += absCurrent - absPrevious;
        }
    }
}
