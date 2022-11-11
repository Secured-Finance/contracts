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
contract LendingMarket is ILendingMarket, MixinAddressResolver, Pausable, Proxyable {
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
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
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
                borrowUnitPrice: getBorrowUnitPrice(),
                lendUnitPrice: getLendUnitPrice(),
                midUnitPrice: getMidUnitPrice()
            });
    }

    /**
     * @notice Gets the highest borrow price per future value.
     * @return The highest borrow price per future value
     */
    function getBorrowUnitPrice() public view override returns (uint256) {
        return Storage.slot().borrowOrders[Storage.slot().maturity].last();
    }

    /**
     * @notice Gets the lowest lend price per future value.
     * @return The lowest lend price per future value
     */
    function getLendUnitPrice() public view override returns (uint256) {
        return Storage.slot().lendOrders[Storage.slot().maturity].first();
    }

    /**
     * @notice Gets the mid price per future value.
     * @return The mid price per future value
     */
    function getMidUnitPrice() public view override returns (uint256) {
        uint256 borrowUnitPrice = getBorrowUnitPrice();
        uint256 lendUnitPrice = getLendUnitPrice();
        return (borrowUnitPrice + lendUnitPrice) / 2;
    }

    /**
     * @notice Gets the order book of borrow.
     * @param _limit Max limit to get unit prices
     * @return unitPrices The array of borrow unit prices
     */
    function getBorrowOrderBook(uint256 _limit)
        external
        view
        override
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        unitPrices = new uint256[](_limit);
        amounts = new uint256[](_limit);
        quantities = new uint256[](_limit);

        uint256 unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].last();
        unitPrices[0] = unitPrice;
        amounts[0] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(
            unitPrice
        );
        quantities[0] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(
            unitPrice
        );

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = Storage.slot().borrowOrders[Storage.slot().maturity].prev(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeTotalAmount(
                unitPrice
            );
            quantities[i] = Storage.slot().borrowOrders[Storage.slot().maturity].getNodeCount(
                unitPrice
            );
        }
    }

    /**
     * @notice Gets the order book of lend.
     * @param _limit Max limit to get unit prices
     * @return unitPrices The array of lending unit prices
     */
    function getLendOrderBook(uint256 _limit)
        external
        view
        override
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        unitPrices = new uint256[](_limit);
        amounts = new uint256[](_limit);
        quantities = new uint256[](_limit);

        uint256 unitPrice = Storage.slot().lendOrders[Storage.slot().maturity].first();
        unitPrices[0] = unitPrice;
        amounts[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
            unitPrice
        );
        quantities[0] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(unitPrice);

        for (uint256 i = 1; i < unitPrices.length; i++) {
            if (unitPrice == 0) {
                break;
            }

            unitPrice = Storage.slot().lendOrders[Storage.slot().maturity].next(unitPrice);
            unitPrices[i] = unitPrice;
            amounts[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeTotalAmount(
                unitPrice
            );
            quantities[i] = Storage.slot().lendOrders[Storage.slot().maturity].getNodeCount(
                unitPrice
            );
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
     * @return unitPrice Amount of interest unit price
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
            uint256 unitPrice,
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
                marketOrder.unitPrice,
                _orderId
            );
        } else {
            orderItem = Storage.slot().borrowOrders[marketOrder.maturity].getOrderById(
                marketOrder.unitPrice,
                _orderId
            );
        }

        if (orderItem.maker != address(0)) {
            return (
                marketOrder.side,
                marketOrder.unitPrice,
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

        maturity = Storage.slot().userCurrentMaturities[_user];

        for (uint256 i = 0; i < activeOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[activeOrderIds[i]];
            // Get a future value in current maturity.
            // If the market is rotated and maturity is updated, it will be 0 by treating it
            // as an order canceled in the past market.
            OrderItem memory orderItem = Storage
                .slot()
                .lendOrders[Storage.slot().maturity]
                .getOrderById(marketOrder.unitPrice, activeOrderIds[i]);
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
            inactiveFutureValue += Storage.slot().lendOrders[marketOrder.maturity].getFutureValue(
                marketOrder.unitPrice,
                inActiveOrderIds[i]
            );
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
                .getOrderById(marketOrder.unitPrice, activeOrderIds[i]);
            activeAmount += orderItem.amount;
        }

        maturity = Storage.slot().userCurrentMaturities[_user];

        for (uint256 i = 0; i < inActiveOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveOrderIds[i]];
            // Get a future value in order maturity.
            // It will be the future value when the order is created, even if the market is rotated
            // and maturity is updated.
            OrderItem memory orderItem = Storage
                .slot()
                .borrowOrders[marketOrder.maturity]
                .getOrderById(marketOrder.unitPrice, inActiveOrderIds[i]);
            inactiveAmount += orderItem.amount;
            inactiveFutureValue += Storage.slot().borrowOrders[marketOrder.maturity].getFutureValue(
                    marketOrder.unitPrice,
                    inActiveOrderIds[i]
                );
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
        bool isPastMaturity = Storage.slot().userCurrentMaturities[_user] !=
            Storage.slot().maturity;

        activeOrderIds = new uint48[](
            isPastMaturity ? 0 : Storage.slot().activeLendOrderIds[_user].length
        );
        inActiveOrderIds = new uint48[](Storage.slot().activeLendOrderIds[_user].length);

        for (uint256 i = 0; i < Storage.slot().activeLendOrderIds[_user].length; i++) {
            uint48 orderId = Storage.slot().activeLendOrderIds[_user][i];
            MarketOrder memory marketOrder = Storage.slot().orders[orderId];

            if (
                !Storage
                    .slot()
                    .lendOrders[Storage.slot().userCurrentMaturities[_user]]
                    .isActiveOrderId(marketOrder.unitPrice, orderId)
            ) {
                inActiveOrderCount += 1;
                inActiveOrderIds[i - activeOrderCount] = orderId;
                if (!isPastMaturity) {
                    assembly {
                        mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                    }
                }
            } else {
                if (!isPastMaturity) {
                    activeOrderCount += 1;
                    activeOrderIds[i - inActiveOrderCount] = orderId;
                }
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
        bool isPastMaturity = Storage.slot().userCurrentMaturities[_user] !=
            Storage.slot().maturity;

        activeOrderIds = new uint48[](
            isPastMaturity ? 0 : Storage.slot().activeBorrowOrderIds[_user].length
        );
        inActiveOrderIds = new uint48[](Storage.slot().activeBorrowOrderIds[_user].length);

        for (uint256 i = 0; i < Storage.slot().activeBorrowOrderIds[_user].length; i++) {
            uint48 orderId = Storage.slot().activeBorrowOrderIds[_user][i];
            MarketOrder memory marketOrder = Storage.slot().orders[orderId];

            if (
                !Storage
                    .slot()
                    .borrowOrders[Storage.slot().userCurrentMaturities[_user]]
                    .isActiveOrderId(marketOrder.unitPrice, orderId)
            ) {
                inActiveOrderCount += 1;
                inActiveOrderIds[i - activeOrderCount] = orderId;
                if (!isPastMaturity) {
                    assembly {
                        mstore(activeOrderIds, sub(mload(activeOrderIds), 1))
                    }
                }
            } else {
                if (!isPastMaturity) {
                    activeOrderCount += 1;
                    activeOrderIds[i - inActiveOrderCount] = orderId;
                }
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
                marketOrder.unitPrice,
                _orderId
            );
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            removedAmount = Storage.slot().borrowOrders[Storage.slot().maturity].removeOrder(
                marketOrder.unitPrice,
                _orderId
            );
        }

        emit CancelOrder(
            _orderId,
            msg.sender,
            marketOrder.side,
            removedAmount,
            marketOrder.unitPrice
        );

        return (marketOrder.side, removedAmount, marketOrder.unitPrice);
    }

    /**
     * @notice Makes new market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Preferable interest unit price
     */
    function _makeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        bool _isInterruption
    ) internal returns (uint48 orderId) {
        orderId = nextOrderId();
        Storage.slot().orders[orderId] = MarketOrder(
            _side,
            _unitPrice,
            Storage.slot().maturity,
            block.timestamp
        );

        if (_side == ProtocolTypes.Side.LEND) {
            Storage.slot().lendOrders[Storage.slot().maturity].insertOrder(
                _unitPrice,
                orderId,
                _user,
                _amount,
                _isInterruption
            );
            Storage.slot().activeLendOrderIds[_user].push(orderId);
        } else if (_side == ProtocolTypes.Side.BORROW) {
            Storage.slot().borrowOrders[Storage.slot().maturity].insertOrder(
                _unitPrice,
                orderId,
                _user,
                _amount,
                _isInterruption
            );
            Storage.slot().activeBorrowOrderIds[_user].push(orderId);
        }

        emit MakeOrder(
            orderId,
            _user,
            _side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            _amount,
            _unitPrice
        );
    }

    /**
     * @notice Takes the market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taken
     */
    function _takeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    ) internal returns (uint256 filledFutureValue, uint256 remainingAmount) {
        UnfilledOrder memory unfilledOrder;

        if (_side == ProtocolTypes.Side.BORROW) {
            (filledFutureValue, remainingAmount, unfilledOrder) = Storage
                .slot()
                .lendOrders[Storage.slot().maturity]
                .dropLeft(_amount, _unitPrice);
        } else if (_side == ProtocolTypes.Side.LEND) {
            (filledFutureValue, remainingAmount, unfilledOrder) = Storage
                .slot()
                .borrowOrders[Storage.slot().maturity]
                .dropRight(_amount, _unitPrice);
        }

        // TODO Emit order history event here.
        // updateOrderHistory(_side, _unitPrice);

        emit TakeOrders(_user, _side, _amount - remainingAmount, _unitPrice, filledFutureValue);

        if (unfilledOrder.amount > 0) {
            _makeOrder(
                _side == ProtocolTypes.Side.BORROW
                    ? ProtocolTypes.Side.LEND
                    : ProtocolTypes.Side.BORROW,
                unfilledOrder.maker,
                unfilledOrder.amount,
                unfilledOrder.unitPrice,
                true
            );
        }

        if (remainingAmount > 0 && _unitPrice != 0) {
            _makeOrder(_side, _user, remainingAmount, _unitPrice, false);
        }
    }

    function cleanOrders(address _user)
        external
        override
        returns (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 removedLendOrderAmount,
            uint256 removedBorrowOrderAmount,
            uint256 maturity
        )
    {
        maturity = Storage.slot().userCurrentMaturities[_user];

        (
            activeLendOrderCount,
            removedLendOrderFutureValue,
            removedLendOrderAmount
        ) = _cleanLendOrders(_user, maturity);
        (
            activeBorrowOrderCount,
            removedBorrowOrderFutureValue,
            removedBorrowOrderAmount
        ) = _cleanBorrowOrders(_user, maturity);
    }

    function _cleanLendOrders(address _user, uint256 _maturity)
        private
        returns (
            uint256 activeOrderCount,
            uint256 removedFutureValue,
            uint256 removedOrderAmount
        )
    {
        (
            uint48[] memory activeLendOrderIds,
            uint48[] memory inActiveLendOrderIds
        ) = _getActiveLendOrderIds(_user);

        Storage.slot().activeLendOrderIds[_user] = activeLendOrderIds;
        activeOrderCount = activeLendOrderIds.length;

        for (uint256 i = 0; i < inActiveLendOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveLendOrderIds[i]];
            OrderItem memory orderItem = Storage.slot().lendOrders[_maturity].getOrderById(
                marketOrder.unitPrice,
                inActiveLendOrderIds[i]
            );
            removedFutureValue += Storage.slot().lendOrders[_maturity].getFutureValue(
                marketOrder.unitPrice,
                inActiveLendOrderIds[i]
            );
            removedOrderAmount += orderItem.amount;
        }
    }

    function _cleanBorrowOrders(address _user, uint256 _maturity)
        private
        returns (
            uint256 activeOrderCount,
            uint256 removedFutureValue,
            uint256 removedOrderAmount
        )
    {
        (
            uint48[] memory activeBorrowOrderIds,
            uint48[] memory inActiveBorrowOrderIds
        ) = _getActiveBorrowOrderIds(_user);

        Storage.slot().activeBorrowOrderIds[_user] = activeBorrowOrderIds;
        activeOrderCount = activeBorrowOrderIds.length;

        for (uint256 i = 0; i < inActiveBorrowOrderIds.length; i++) {
            MarketOrder memory marketOrder = Storage.slot().orders[inActiveBorrowOrderIds[i]];
            OrderItem memory orderItem = Storage.slot().borrowOrders[_maturity].getOrderById(
                marketOrder.unitPrice,
                inActiveBorrowOrderIds[i]
            );
            removedFutureValue += Storage.slot().borrowOrders[_maturity].getFutureValue(
                marketOrder.unitPrice,
                inActiveBorrowOrderIds[i]
            );

            removedOrderAmount += orderItem.amount;
        }
    }

    /**
     * @notice Creates the order. Takes the order if the order is matched,
     * and places new order if not match it.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     */
    function createOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    )
        external
        override
        whenNotPaused
        onlyAcceptedContracts
        ifOpened
        returns (uint256 filledFutureValue, uint256 remainingAmount)
    {
        require(_amount > 0, "Can't place empty amount");
        require(
            Storage.slot().userCurrentMaturities[_user] == Storage.slot().maturity ||
                (Storage.slot().userCurrentMaturities[_user] != Storage.slot().maturity &&
                    Storage.slot().activeLendOrderIds[_user].length == 0 &&
                    Storage.slot().activeBorrowOrderIds[_user].length == 0),
            "Order found in past maturity."
        );

        if (Storage.slot().userCurrentMaturities[_user] != Storage.slot().maturity) {
            Storage.slot().userCurrentMaturities[_user] = Storage.slot().maturity;
        }

        bool isExists = _unitPrice == 0 ||
            (
                _side == ProtocolTypes.Side.LEND
                    ? Storage.slot().borrowOrders[Storage.slot().maturity].last() >= _unitPrice
                    : Storage.slot().lendOrders[Storage.slot().maturity].first() <= _unitPrice
            );

        if (isExists) {
            (filledFutureValue, remainingAmount) = _takeOrder(_side, _user, _amount, _unitPrice);
        } else {
            _makeOrder(_side, _user, _amount, _unitPrice, false);
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
