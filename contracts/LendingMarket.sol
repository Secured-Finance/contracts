// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
// interfaces
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {HitchensOrderStatisticsTreeLib, UnfilledOrder, OrderItem} from "./libraries/HitchensOrderStatisticsTreeLib.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinOrderManager} from "./mixins/MixinOrderManager.sol";

// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketStorage as Storage, MarketOrder} from "./storages/LendingMarketStorage.sol";

/**
 * @notice Implements the module that allows lending market participants to create/cancel market orders,
 * and also provides a future value calculation module.
 *
 * For updates, this contract is basically called from `LendingMarketController.sol`instead of being called \
 * directly by the user.
 *
 * @dev The market orders is stored in structured red-black trees and doubly linked lists in each node.
 */
contract LendingMarket is
    ILendingMarket,
    MixinAddressResolver,
    MixinOrderManager,
    Pausable,
    Proxyable
{
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    /**
     * @notice Modifier to make a function callable only by order maker.
     * @param _orderId Market order id
     */
    modifier onlyMaker(address user, uint48 _orderId) {
        (, , , address maker, , ) = getOrder(_orderId);
        require(maker != address(0), "Order not found");
        require(user == maker, "Caller is not the maker");
        _;
    }

    /**
     * @notice Modifier to check if the market is opened.
     */
    modifier ifOpened() {
        require(isOpened(), "Market is not opened");
        _;
    }

    /**
     * @notice Modifier to check if the market is matured.
     */
    modifier ifMatured() {
        require(isMatured(), "Market is not matured");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _resolver The address of the Address Resolver contract
     * @param _ccy The main currency for the order book
     * @param _maturity The initial maturity of the market
     * @param _basisDate The basis date when the first market open
     */
    function initialize(
        address _resolver,
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _basisDate
    ) public initializer onlyBeacon {
        registerAddressResolver(_resolver);

        Storage.slot().ccy = _ccy;
        Storage.slot().maturity = _maturity;
        Storage.slot().basisDate = _basisDate;

        buildCache();
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[1] = Contracts.TOKEN_VAULT;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @notice Gets the market data.
     * @return market The market data
     */
    function getMarket() external view override returns (Market memory market) {
        return
            Market({
                ccy: Storage.slot().ccy,
                maturity: Storage.slot().maturity,
                basisDate: Storage.slot().basisDate,
                borrowRate: getBorrowRate(),
                lendRate: getLendRate(),
                midRate: getMidRate()
            });
    }

    /**
     * @notice Gets the highest borrow rate.
     * @return rate The highest borrow rate
     */
    function getBorrowRate() public view override returns (uint256 rate) {
        uint256 maturity = Storage.slot().maturity;
        return Storage.slot().borrowOrders[maturity].last();
    }

    /**
     * @notice Gets the lowest lend rate.
     * @return rate The lowest lend rate
     */
    function getLendRate() public view override returns (uint256 rate) {
        return Storage.slot().lendOrders[Storage.slot().maturity].first();
    }

    /**
     * @notice Gets the mid rate.
     * @return rate The mid rate
     */
    function getMidRate() public view override returns (uint256 rate) {
        uint256 borrowRate = getBorrowRate();
        uint256 lendRate = getLendRate();
        uint256 combinedRate = borrowRate + lendRate;

        return combinedRate / 2;
    }

    /**
     * @notice Gets the order book of borrow.
     * @param _limit Max limit to get rates
     * @return rates The array of borrow rates
     */
    function getBorrowOrderBook(uint256 _limit)
        external
        view
        override
        returns (
            uint256[] memory rates,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        rates = new uint256[](_limit);
        amounts = new uint256[](_limit);
        quantities = new uint256[](_limit);

        uint256 rate = Storage.slot().borrowOrders[Storage.slot().maturity].last();
        rates[0] = rate;
        amounts[0] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(rate);
        quantities[0] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(rate);

        for (uint256 i = 1; i < rates.length; i++) {
            if (rate == 0) {
                break;
            }

            rate = Storage.slot().borrowOrders[Storage.slot().maturity].prev(rate);
            rates[i] = rate;
            amounts[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(
                rate
            );
            quantities[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(rate);
        }
    }

    /**
     * @notice Gets the order book of lend.
     * @param _limit Max limit to get rates
     * @return rates The array of lending rates
     */
    function getLendOrderBook(uint256 _limit)
        external
        view
        override
        returns (
            uint256[] memory rates,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        rates = new uint256[](_limit);
        amounts = new uint256[](_limit);
        quantities = new uint256[](_limit);

        uint256 rate = Storage.slot().lendOrders[Storage.slot().maturity].first();
        rates[0] = rate;
        amounts[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(rate);
        quantities[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(rate);

        for (uint256 i = 1; i < rates.length; i++) {
            if (rate == 0) {
                break;
            }

            rate = Storage.slot().lendOrders[Storage.slot().maturity].next(rate);
            rates[i] = rate;
            amounts[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
                rate
            );
            quantities[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(rate);
        }
    }

    /**
     * @notice Gets the current market maturity.
     * @return maturity The market maturity
     */
    function getMaturity() external view override returns (uint256 maturity) {
        return Storage.slot().maturity;
    }

    /**
     * @notice Gets the market currency.
     * @return currency The market currency
     */
    function getCurrency() external view override returns (bytes32 currency) {
        return Storage.slot().ccy;
    }

    /**
     * @notice Gets if the market is matured.
     * @return The boolean if the market is matured or not
     */
    function isMatured() public view override returns (bool) {
        return block.timestamp >= Storage.slot().maturity;
    }

    /**
     * @notice Gets if the market is opened.
     * @return The boolean if the market is opened or not
     */
    function isOpened() public view override returns (bool) {
        return !isMatured() && block.timestamp >= Storage.slot().basisDate;
    }

    /**
     * @notice Gets the market order from the order book.
     * @param _orderId The market order id
     * @return side Order position type, Borrow or Lend
     * @return rate Amount of interest rate
     * @return maturity The maturity of the selected order
     * @return maker The order maker
     * @return amount Order amount
     * @return timestamp Timestamp when the order was created
     */
    function getOrder(uint48 _orderId)
        public
        view
        override
        returns (
            ProtocolTypes.Side side,
            uint256 rate,
            uint256 maturity,
            address maker,
            uint256 amount,
            uint256 timestamp
        )
    {
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];

        OrderItem memory orderItem;
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            orderItem = Storage.slot().lendOrders[marketOrder.maturity].getOrderById(
                marketOrder.rate,
                _orderId
            );
        } else {
            orderItem = Storage.slot().borrowOrders[marketOrder.maturity].getOrderById(
                marketOrder.rate,
                _orderId
            );
        }

        if (orderItem.maker != address(0)) {
            return (
                marketOrder.side,
                marketOrder.rate,
                marketOrder.maturity,
                orderItem.maker,
                orderItem.amount,
                orderItem.timestamp
            );
        }
    }

    function getTotalAmountFromLendOrders(address _user)
        external
        view
        override
        returns (
            uint256 activeAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds) = _getActiveLendOrderIds(
            _user
        );

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[activeOrderIds[i]];
            if (maturity == 0) {
                maturity = marketOrder.maturity;
            }
            // Get a future value in current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = Storage
                .slot()
                .lendOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.rate, activeOrderIds[i]);
            activeAmount += orderItem.amount;
        }

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveOrderIds[i]];
            if (maturity == 0) {
                maturity = marketOrder.maturity;
            }
            // Get a future value in order maturity.
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            OrderItem memory orderItem = Storage
                .slot()
                .lendOrders[marketOrder.maturity]
                .getOrderById(marketOrder.rate, inActiveOrderIds[i]);
            inactiveFutureValue += getFutureValue(orderItem.amount, marketOrder.rate);
        }
    }

    function getTotalAmountFromBorrowOrders(address _user)
        external
        view
        override
        returns (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValue,
            uint256 maturity
        )
    {
        (
            uint48[] memory activeOrderIds,
            uint48[] memory inActiveOrderIds
        ) = _getActiveBorrowOrderIds(_user);

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[activeOrderIds[i]];
            // Get a future value in current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = Storage
                .slot()
                .borrowOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.rate, activeOrderIds[i]);
            activeAmount += orderItem.amount;
        }

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveOrderIds[i]];
            if (maturity == 0) {
                maturity = marketOrder.maturity;
            }
            // Get a future value in order maturity.
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            OrderItem memory orderItem = Storage
                .slot()
                .borrowOrders[marketOrder.maturity]
                .getOrderById(marketOrder.rate, inActiveOrderIds[i]);
            inactiveAmount += orderItem.amount;
            inactiveFutureValue += getFutureValue(orderItem.amount, marketOrder.rate);
        }
    }

    function getActiveLendOrderIds(address _user)
        external
        view
        override
        returns (uint48[] memory activeOrderIds)
    {
        (activeOrderIds, ) = _getActiveLendOrderIds(_user);
    }

    function getActiveBorrowOrderIds(address _user)
        external
        view
        override
        returns (uint48[] memory activeOrderIds)
    {
        (activeOrderIds, ) = _getActiveBorrowOrderIds(_user);
    }

    function _getActiveLendOrderIds(address _user)
        private
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        uint256 activeOrderCount = 0;
        uint256 inActiveOrderCount = 0;

        activeOrderIds = new uint48[](Storage.slot().activeLendOrderIds[_user].length);
        inActiveOrderIds = new uint48[](Storage.slot().activeLendOrderIds[_user].length);

        for (uint256 i = 0; i < Storage.slot().activeLendOrderIds[_user].length; i++) {
            uint48 orderId = Storage.slot().activeLendOrderIds[_user][i];
            MarketOrder memory marketOrder = Storage.slot().orders[orderId];

            if (isTakenLendOrder(marketOrder.timestamp, marketOrder.rate, orderId)) {
                inActiveOrderCount += 1;
                inActiveOrderIds[i - activeOrderCount] = orderId;
                assembly {
                    mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                }
            } else {
                activeOrderCount += 1;
                activeOrderIds[i - inActiveOrderCount] = orderId;
                assembly {
                    mstore(inActiveOrderIds, sub(mload(inActiveOrderIds), 1))
                }
            }
        }
    }

    function _getActiveBorrowOrderIds(address _user)
        private
        view
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        uint256 activeOrderCount = 0;
        uint256 inActiveOrderCount = 0;

        // console.log(" borrow order count:", Storage.slot().activeBorrowOrderIds[_user].length);
        activeOrderIds = new uint48[](Storage.slot().activeBorrowOrderIds[_user].length);
        inActiveOrderIds = new uint48[](Storage.slot().activeBorrowOrderIds[_user].length);

        for (uint256 i = 0; i < Storage.slot().activeBorrowOrderIds[_user].length; i++) {
            uint48 orderId = Storage.slot().activeBorrowOrderIds[_user][i];
            MarketOrder memory marketOrder = Storage.slot().orders[orderId];

            if (isTakenBorrowOrder(marketOrder.timestamp, marketOrder.rate, orderId)) {
                inActiveOrderCount += 1;
                inActiveOrderIds[i - activeOrderCount] = orderId;
                assembly {
                    mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                }
            } else {
                activeOrderCount += 1;
                activeOrderIds[i - inActiveOrderCount] = orderId;
                assembly {
                    mstore(inActiveOrderIds, sub(mload(inActiveOrderIds), 1))
                }
            }
        }
    }

    /**
     * @notice Increases and returns id of last order in order book.
     * @return The new order id
     */
    function nextOrderId() internal returns (uint48) {
        Storage.slot().lastOrderId++;
        return Storage.slot().lastOrderId;
    }

    /**
     * @notice Opens market
     * @param _maturity The new maturity
     */
    function openMarket(uint256 _maturity)
        external
        override
        ifMatured
        onlyAcceptedContracts
        returns (uint256 prevMaturity)
    {
        prevMaturity = Storage.slot().maturity;
        Storage.slot().maturity = _maturity;

        emit OpenMarket(_maturity, prevMaturity);
    }

    /**
     * @notice Cancels the order.
     * @param _user User address
     * @param _orderId Market order id
     */
    function cancelOrder(address _user, uint48 _orderId)
        external
        override
        onlyMaker(_user, _orderId)
        whenNotPaused
        onlyAcceptedContracts
        returns (
            ProtocolTypes.Side,
            uint256,
            uint256
        )
    {
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];
        uint256 removedAmount;
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            removedAmount = Storage.slot().lendOrders[Storage.slot().maturity].removeOrder(
                marketOrder.rate,
                _orderId
            );
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            removedAmount = Storage.slot().borrowOrders[Storage.slot().maturity].removeOrder(
                marketOrder.rate,
                _orderId
            );
        }

        emit CancelOrder(_orderId, msg.sender, marketOrder.side, removedAmount, marketOrder.rate);

        return (marketOrder.side, removedAmount, marketOrder.rate);
    }

    /**
     * @notice Makes new market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Preferable interest rate
     */
    function _makeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _rate,
        bool _isInterruption
    ) internal returns (uint48 orderId) {
        orderId = nextOrderId();
        Storage.slot().orders[orderId] = MarketOrder(
            _side,
            _rate,
            Storage.slot().maturity,
            block.timestamp
        );

        if (_side == ProtocolTypes.Side.LEND) {
            Storage.slot().lendOrders[Storage.slot().maturity].insertOrder(
                _rate,
                orderId,
                _user,
                _amount,
                _isInterruption
            );
        } else if (_side == ProtocolTypes.Side.BORROW) {
            Storage.slot().borrowOrders[Storage.slot().maturity].insertOrder(
                _rate,
                orderId,
                _user,
                _amount,
                _isInterruption
            );
        }

        if (_side == ProtocolTypes.Side.LEND) {
            Storage.slot().activeLendOrderIds[_user].push(orderId);
        } else {
            Storage.slot().activeBorrowOrderIds[_user].push(orderId);
        }

        emit MakeOrder(
            orderId,
            _user,
            _side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            _amount,
            _rate
        );
    }

    /**
     * @notice Takes the market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taken
     */
    function _takeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _rate
    ) internal returns (uint256 executedRate, uint256 remainingAmount) {
        UnfilledOrder memory unfilledOrder;

        if (_side == ProtocolTypes.Side.BORROW) {
            // (orderIds, makers, amounts, remainingAmount, unfilledOrder) = Storage
            //     .slot()
            //     .lendOrders[Storage.slot().maturity]
            //     .fillOrders(_rate, _amount);
        } else if (_side == ProtocolTypes.Side.LEND) {
            // (orderIds, makers, amounts, remainingAmount, unfilledOrder) = Storage
            //     .slot()
            //     .borrowOrders[Storage.slot().maturity]
            //     .fillOrders(_rate, _amount);
            (executedRate, remainingAmount, unfilledOrder) = Storage
                .slot()
                .borrowOrders[Storage.slot().maturity]
                .dropLeft(_amount, _rate);
        }

        // for (uint48 i = 0; i < orderIds.length; i++) {
        //     MarketOrder memory marketOrder = Storage.slot().orders[orderIds[i]];

        //     address lender;
        //     address borrower;
        //     if (_side == ProtocolTypes.Side.BORROW) {
        //         lender = makers[i];
        //         borrower = _user;
        //     } else if (_side == ProtocolTypes.Side.LEND) {
        //         lender = _user;
        //         borrower = makers[i];
        //     }

        //     // NOTE: The formula is: futureValue = amount * (1 + rate * (maturity - now) / 360 days).
        //     uint256 currentRate = (marketOrder.rate * (Storage.slot().maturity - block.timestamp)) /
        //         ProtocolTypes.SECONDS_IN_YEAR;
        //     uint256 fvAmount = (_amount * (ProtocolTypes.BP + currentRate)) / ProtocolTypes.BP;
        //     _addFutureValue(lender, borrower, fvAmount, Storage.slot().maturity);
        // }

        updateOrderHistory(_side, _rate);

        // emit TakeOrders(orderIds, _user, _side, _amount, _rate);
        emit TakeOrders(_user, _side, _amount, _rate);

        if (unfilledOrder.amount > 0) {
            _makeOrder(
                _side == ProtocolTypes.Side.BORROW
                    ? ProtocolTypes.Side.LEND
                    : ProtocolTypes.Side.BORROW,
                unfilledOrder.maker,
                unfilledOrder.amount,
                _rate,
                true
            );
        }

        if (remainingAmount > 0) {
            _makeOrder(_side, _user, remainingAmount, _rate, false);
        }
    }

    // /**
    //  * @notice Gets if the market order will be matched or not.
    //  *
    //  * Returns zero if there is not a matched order.
    //  * Reverts if no orders for specified interest rate.
    //  *
    //  * @param _side Order position type, Borrow or Lend
    //  * @param _amount Amount of funds the maker wants to borrow/lend
    //  * @param _rate Amount of interest rate taker wish to borrow/lend
    //  */
    // function matchOrders(
    //     ProtocolTypes.Side _side,
    //     uint256 _amount,
    //     uint256 _rate
    // ) external view override ifOpened returns (uint256) {
    //     if (_side == ProtocolTypes.Side.LEND) {
    //         require(
    //             Storage.slot().borrowOrders[Storage.slot().maturity].exists(_rate),
    //             "No orders exists for selected interest rate"
    //         );
    //         return
    //             Storage.slot().borrowOrders[Storage.slot().maturity].findOrderIdForAmount(
    //                 _rate,
    //                 _amount
    //             );
    //     } else {
    //         require(
    //             Storage.slot().lendOrders[Storage.slot().maturity].exists(_rate),
    //             "No orders exists for selected interest rate"
    //         );
    //         return
    //             Storage.slot().lendOrders[Storage.slot().maturity].findOrderIdForAmount(
    //                 _rate,
    //                 _amount
    //             );
    //     }
    // }

    function cleanOrders(address _user)
        external
        override
        returns (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue
        )
    {
        (activeLendOrderCount, removedLendOrderFutureValue) = _cleanLendOrders(_user);
        (activeBorrowOrderCount, removedBorrowOrderFutureValue) = _cleanBorrowOrders(_user);
    }

    function _cleanLendOrders(address _user)
        private
        returns (uint256 activeOrderCount, uint256 removedOrderFutureValue)
    {
        (
            uint48[] memory activeLendOrderIds,
            uint48[] memory inActiveLendOrderIds
        ) = _getActiveLendOrderIds(_user);

        Storage.slot().activeLendOrderIds[_user] = activeLendOrderIds;
        activeOrderCount = activeLendOrderIds.length;

        for (uint256 i = 0; i < inActiveLendOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveLendOrderIds[i]];
            OrderItem memory orderItem = Storage
                .slot()
                .lendOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.rate, inActiveLendOrderIds[i]);
            removedOrderFutureValue += getFutureValue(orderItem.amount, marketOrder.rate);

            tokenVault().removeCollateral(_user, Storage.slot().ccy, orderItem.amount);
        }
    }

    function _cleanBorrowOrders(address _user)
        private
        returns (uint256 activeOrderCount, uint256 removedOrderFutureValue)
    {
        (
            uint48[] memory activeBorrowOrderIds,
            uint48[] memory inActiveBorrowOrderIds
        ) = _getActiveBorrowOrderIds(_user);

        Storage.slot().activeBorrowOrderIds[_user] = activeBorrowOrderIds;
        activeOrderCount = activeBorrowOrderIds.length;

        for (uint256 i = 0; i < inActiveBorrowOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveBorrowOrderIds[i]];
            OrderItem memory orderItem = Storage
                .slot()
                .borrowOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.rate, inActiveBorrowOrderIds[i]);
            removedOrderFutureValue += getFutureValue(orderItem.amount, marketOrder.rate);

            tokenVault().addCollateral(_user, Storage.slot().ccy, orderItem.amount);
        }
    }

    function getFutureValue(uint256 _amount, uint256 _rate)
        private
        view
        returns (uint256 fvAmount)
    {
        // NOTE: The formula is: futureValue = amount * (1 + rate * (maturity - now) / 360 days).
        uint256 currentRate = (_rate * (Storage.slot().maturity - block.timestamp)) /
            ProtocolTypes.SECONDS_IN_YEAR;
        fvAmount = (_amount * (ProtocolTypes.BP + currentRate)) / ProtocolTypes.BP;
        // _addFutureValue(lender, borrower, fvAmount, Storage.slot().maturity);
    }

    /**
     * @notice Creates the order. Takes the order if the order is matched,
     * and places new order if not match it.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     */
    function createOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _rate
    )
        external
        override
        whenNotPaused
        onlyAcceptedContracts
        ifOpened
        returns (uint256 executedRate, uint256 remainingAmount)
    {
        require(_amount > 0, "Can't place empty amount");
        require(_rate > 0, "Can't place empty rate");

        bool isExists = _side == ProtocolTypes.Side.LEND
            ? Storage.slot().borrowOrders[Storage.slot().maturity].exists(_rate)
            : Storage.slot().lendOrders[Storage.slot().maturity].exists(_rate);

        if (!isExists) {
            _makeOrder(_side, _user, _amount, _rate, false);
        } else {
            (executedRate, remainingAmount) = _takeOrder(_side, _user, _amount, _rate);
        }
    }

    /**
     * @notice Pauses the lending market.
     */
    function pauseMarket() external override onlyAcceptedContracts {
        _pause();
    }

    /**
     * @notice Unpauses the lending market.
     */
    function unpauseMarket() external override onlyAcceptedContracts {
        _unpause();
    }
}
