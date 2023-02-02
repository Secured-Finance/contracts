// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
// interfaces
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {OrderBookLogic} from "./libraries/logics/OrderBookLogic.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketStorage as Storage, RemainingOrder} from "./storages/LendingMarketStorage.sol";

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
     * @param _genesisDate The initial date when the first market open
     */
    function initialize(
        address _resolver,
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _genesisDate
    ) public initializer onlyBeacon {
        registerAddressResolver(_resolver);

        Storage.slot().ccy = _ccy;
        Storage.slot().maturity = _maturity;
        Storage.slot().genesisDate = _genesisDate;

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
                genesisDate: Storage.slot().genesisDate,
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
        return OrderBookLogic.getHighestBorrowUnitPrice();
    }

    /**
     * @notice Gets the lowest lend price per future value.
     * @return The lowest lend price per future value
     */
    function getLendUnitPrice() public view override returns (uint256) {
        return OrderBookLogic.getLowestLendUnitPrice();
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
        return OrderBookLogic.getBorrowOrderBook(_limit);
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
        return OrderBookLogic.getLendOrderBook(_limit);
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
        return !isMatured() && block.timestamp >= Storage.slot().genesisDate;
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
        return OrderBookLogic.getOrder(_orderId);
    }

    /**
     * @notice Calculates and gets the active and inactive amounts from the user orders of lending deals.
     * @param _user User's address
     * @return activeAmount The total amount of active order on the order book
     * @return inactiveAmount The total amount of inactive orders filled on the order book
     * @return inactiveFutureValue The total future value amount of inactive orders filled on the order book
     * @return maturity The maturity of market that orders were placed.
     */
    function getTotalAmountFromLendOrders(address _user)
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
        return OrderBookLogic.getTotalAmountFromLendOrders(_user);
    }

    /**
     * @notice Calculates and gets the active and inactive amounts from the user orders of borrowing deals.
     * @param _user User's address
     * @return activeAmount The total amount of active order on the order book
     * @return inactiveAmount The total amount of inactive orders filled on the order book
     * @return inactiveFutureValue The total future value amount of inactive orders filled on the order book
     * @return maturity The maturity of market that orders were placed.
     */
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
        return OrderBookLogic.getTotalAmountFromBorrowOrders(_user);
    }

    /**
     * @notice Gets the order ids of active lending order on the order book
     * @param _user User's address
     */
    function getActiveLendOrderIds(address _user)
        external
        view
        override
        returns (uint48[] memory activeOrderIds)
    {
        (activeOrderIds, ) = OrderBookLogic.getActiveLendOrderIds(_user);
    }

    /**
     * @notice Gets the order ids of active borrowing order on the order book
     * @param _user User's address
     */
    function getActiveBorrowOrderIds(address _user)
        external
        view
        override
        returns (uint48[] memory activeOrderIds)
    {
        (activeOrderIds, ) = OrderBookLogic.getActiveBorrowOrderIds(_user);
    }

    /**
     * @notice Estimates the filled amount at the time of order creation on the order book
     * using the future value amount.
     * @param _side Order position type, Borrow or Lend
     * @param _futureValue Future value amount
     * @return amount The estimated amount in the present value that is filled on the order book
     */
    function estimateFilledAmount(ProtocolTypes.Side _side, uint256 _futureValue)
        external
        view
        override
        returns (uint256 amount)
    {
        return OrderBookLogic.estimateFilledAmount(_side, _futureValue);
    }

    /**
     * @notice Opens market
     * @param _maturity The new maturity
     * @return prevMaturity The previous maturity updated
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
     * @return side The canceled order position type
     * @return removedAmount The removed order amount from the order book by canceling
     * @return unitPrice The canceled order unit price
     */
    function cancelOrder(address _user, uint48 _orderId)
        external
        override
        onlyMaker(_user, _orderId)
        whenNotPaused
        onlyAcceptedContracts
        returns (
            ProtocolTypes.Side side,
            uint256 removedAmount,
            uint256 unitPrice
        )
    {
        (side, removedAmount, unitPrice) = OrderBookLogic.removeOrder(_user, _orderId);

        emit ILendingMarket.CancelOrder(
            _orderId,
            msg.sender,
            side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            removedAmount,
            unitPrice
        );
    }

    /**
     * @notice Cleans own orders to remove order ids that are already filled on the order book.
     * @dev The order list per user is not updated in real-time when an order is filled.
     * This function removes the filled order from that order list per user to reduce gas costs
     * for calculating if the collateral is enough or not.
     *
     * @param _user User address
     * @return activeLendOrderCount The total amount of active lend order on the order book
     * @return activeBorrowOrderCount The total amount of active borrow order on the order book
     * @return removedLendOrderFutureValue The total FV amount of the removed lend order amount from the order book
     * @return removedBorrowOrderFutureValue The total FV amount of the removed borrow order amount from the order book
     * @return removedLendOrderAmount The total PV amount of the removed lend order amount from the order book
     * @return removedBorrowOrderAmount The total PV amount of the removed borrow order amount from the order book
     * @return maturity The maturity of the removed orders
     */
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

        uint48[] memory lendOrderIds;
        uint48[] memory borrowOrderIds;

        (
            lendOrderIds,
            activeLendOrderCount,
            removedLendOrderFutureValue,
            removedLendOrderAmount
        ) = OrderBookLogic.cleanLendOrders(_user, maturity);

        (
            borrowOrderIds,
            activeBorrowOrderCount,
            removedBorrowOrderFutureValue,
            removedBorrowOrderAmount
        ) = OrderBookLogic.cleanBorrowOrders(_user, maturity);

        if (removedLendOrderAmount > 0) {
            emit CleanOrders(
                lendOrderIds,
                _user,
                ProtocolTypes.Side.LEND,
                Storage.slot().ccy,
                Storage.slot().maturity
            );
        }

        if (removedBorrowOrderAmount > 0) {
            emit CleanOrders(
                borrowOrderIds,
                _user,
                ProtocolTypes.Side.BORROW,
                Storage.slot().ccy,
                Storage.slot().maturity
            );
        }
    }

    /**
     * @notice Creates the order. Takes the order if the order is matched,
     * and places new order if not match it.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @param _ignoreRemainingAmount Boolean for whether to ignore the remaining amount after taking orders
     * @return filledFutureValue The total FV amount of the filled order amount on the order book
     * @return remainingAmount The remaining amount that is not filled in the order book
     */
    function createOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        bool _ignoreRemainingAmount
    )
        external
        override
        whenNotPaused
        onlyAcceptedContracts
        ifOpened
        returns (uint256 filledFutureValue, uint256 remainingAmount)
    {
        uint256 userMaturity = Storage.slot().userCurrentMaturities[_user];
        require(_amount > 0, "Can't place empty amount");
        require(
            userMaturity == Storage.slot().maturity ||
                (userMaturity != Storage.slot().maturity &&
                    Storage.slot().activeLendOrderIds[_user].length == 0 &&
                    Storage.slot().activeBorrowOrderIds[_user].length == 0),
            "Order found in past maturity."
        );

        if (userMaturity != Storage.slot().maturity) {
            Storage.slot().userCurrentMaturities[_user] = Storage.slot().maturity;
        }

        bool isExists = _unitPrice == 0 ||
            (
                _side == ProtocolTypes.Side.LEND
                    ? OrderBookLogic.getHighestBorrowUnitPrice() >= _unitPrice
                    : OrderBookLogic.getLowestLendUnitPrice() <= _unitPrice
            );

        if (isExists) {
            (filledFutureValue, remainingAmount) = _takeOrder(
                _side,
                _user,
                _amount,
                _unitPrice,
                _ignoreRemainingAmount
            );
        } else {
            _makeOrder(_side, _user, _amount, _unitPrice, false, 0);
            remainingAmount = _amount;
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

    /**
     * @notice Makes new market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Preferable interest unit price
     * @param _originalOrderId The original order id that filled partially
     */
    function _makeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        bool _isInterruption,
        uint48 _originalOrderId
    ) private returns (uint48 orderId) {
        orderId = OrderBookLogic.insertOrder(_side, _user, _amount, _unitPrice, _isInterruption);

        emit ILendingMarket.MakeOrder(
            orderId,
            _originalOrderId,
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
     * @param _ignoreRemainingAmount Boolean for whether to ignore the remaining amount after taking orders
     */
    function _takeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        bool _ignoreRemainingAmount
    ) private returns (uint256 filledFutureValue, uint256 remainingAmount) {
        RemainingOrder memory remainingOrder;

        (remainingOrder, filledFutureValue, remainingAmount) = OrderBookLogic.dropOrders(
            _side,
            _amount,
            _unitPrice
        );

        emit ILendingMarket.TakeOrders(
            _user,
            _side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            _amount - remainingAmount,
            _unitPrice,
            filledFutureValue
        );

        if (remainingOrder.amount > 0) {
            // Make a new order for the remaining amount of a partially filled order
            _makeOrder(
                _side == ProtocolTypes.Side.BORROW
                    ? ProtocolTypes.Side.LEND
                    : ProtocolTypes.Side.BORROW,
                remainingOrder.maker,
                remainingOrder.amount,
                remainingOrder.unitPrice,
                true,
                remainingOrder.orderId
            );
        }

        if (remainingAmount > 0 && _unitPrice != 0 && !_ignoreRemainingAmount) {
            // Make a new order for the remaining amount of input
            _makeOrder(_side, _user, remainingAmount, _unitPrice, false, 0);
        }
    }
}
