// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {OrderBookLogic} from "./libraries/logics/OrderBookLogic.sol";
import {RoundingUint256} from "./libraries/math/RoundingUint256.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Pausable} from "./utils/Pausable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketStorage as Storage, ItayoseLog} from "./storages/LendingMarketStorage.sol";

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
    using RoundingUint256 for uint256;

    uint256 private constant PRE_ORDER_PERIOD = 7 days;
    uint256 private constant ITAYOSE_PERIOD = 1 hours;

    /**
     * @notice Modifier to make a function callable only by order maker.
     * @param _orderId Market order id
     */
    modifier onlyMaker(address user, uint48 _orderId) {
        (, , , address maker, , , ) = getOrder(_orderId);
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

    modifier ifItayosePeriod() {
        require(isItayosePeriod(), "Not in the Itayose period");
        _;
    }

    modifier ifPreOrderPeriod() {
        require(isPreOrderPeriod(), "Not in the pre-order period");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _resolver The address of the Address Resolver contract
     * @param _ccy The main currency for the order book
     * @param _maturity The initial maturity of the market
     * @param _openingDate The timestamp when the market opens
     */
    function initialize(
        address _resolver,
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _openingDate
    ) public initializer onlyBeacon {
        registerAddressResolver(_resolver);

        Storage.slot().ccy = _ccy;
        Storage.slot().maturity = _maturity;
        Storage.slot().openingDate = _openingDate;

        if (block.timestamp >= (_openingDate - ITAYOSE_PERIOD)) {
            Storage.slot().isReady[Storage.slot().maturity] = true;
        }

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
                openingDate: Storage.slot().openingDate,
                borrowUnitPrice: OrderBookLogic.getLowestBorrowingUnitPrice(),
                lendUnitPrice: OrderBookLogic.getHighestLendingUnitPrice(),
                midUnitPrice: getMidUnitPrice(),
                openingUnitPrice: Storage
                    .slot()
                    .itayoseLogs[Storage.slot().maturity]
                    .openingUnitPrice,
                isReady: isReady()
            });
    }

    /**
     * @notice Gets unit price Thresholds by CircuitBreaker.
     * @param _circuitBreakerLimitRange Rate limit range for the circuit breaker
     * @return maxLendUnitPrice The maximum unit price for lending
     * @return minBorrowUnitPrice The minimum unit price for borrowing
     */
    function getCircuitBreakerThresholds(uint256 _circuitBreakerLimitRange)
        external
        view
        override
        returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice)
    {
        return OrderBookLogic.getCircuitBreakerThresholds(_circuitBreakerLimitRange);
    }

    /**
     * @notice Gets the lowest borrow price per future value.
     * @return The lowest borrow price per future value
     */
    function getBorrowUnitPrice() external view override returns (uint256) {
        return OrderBookLogic.getLowestBorrowingUnitPrice();
    }

    /**
     * @notice Gets the highest lend price per future value.
     * @return The highest lend price per future value
     */
    function getLendUnitPrice() external view override returns (uint256) {
        return OrderBookLogic.getHighestLendingUnitPrice();
    }

    /**
     * @notice Gets the mid price per future value.
     * @return The mid price per future value
     */
    function getMidUnitPrice() public view override returns (uint256) {
        uint256 borrowUnitPrice = OrderBookLogic.getLowestBorrowingUnitPrice();
        uint256 lendUnitPrice = OrderBookLogic.getHighestLendingUnitPrice();
        return (borrowUnitPrice + lendUnitPrice).div(2);
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
     * @notice Gets the market opening date.
     * @return openingDate The market opening date
     */
    function getOpeningDate() external view override returns (uint256 openingDate) {
        return Storage.slot().openingDate;
    }

    /**
     * @notice Gets if the market is ready.
     * @return The boolean if the market is ready or not
     */
    function isReady() public view override returns (bool) {
        return Storage.slot().isReady[Storage.slot().maturity];
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
        return
            Storage.slot().isReady[Storage.slot().maturity] &&
            !isMatured() &&
            block.timestamp >= Storage.slot().openingDate;
    }

    /**
     * @notice Gets if the market is under the Itayose period.
     * @return The boolean if the market is under the Itayose period.
     */
    function isItayosePeriod() public view returns (bool) {
        return
            block.timestamp >= (Storage.slot().openingDate - ITAYOSE_PERIOD) &&
            !Storage.slot().isReady[Storage.slot().maturity];
    }

    /**
     * @notice Gets if the market is under the pre-order period.
     * @return The boolean if the market is under the pre-order period.
     */
    function isPreOrderPeriod() public view override returns (bool) {
        return
            block.timestamp >= (Storage.slot().openingDate - PRE_ORDER_PERIOD) &&
            block.timestamp < (Storage.slot().openingDate - ITAYOSE_PERIOD);
    }

    /**
     * @notice Gets the market itayose logs.
     * @param _maturity The market maturity
     * @return ItayoseLog of the market
     */
    function getItayoseLog(uint256 _maturity) external view override returns (ItayoseLog memory) {
        return Storage.slot().itayoseLogs[_maturity];
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
     * @return isPreOrder The boolean if the order is a pre-order.
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
            uint256 timestamp,
            bool isPreOrder
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
     * @notice Gets active and inactive order IDs in the lending order book.
     * @param _user User's address
     */
    function getLendOrderIds(address _user)
        external
        view
        override
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        (activeOrderIds, inActiveOrderIds) = OrderBookLogic.getLendOrderIds(_user);
    }

    /**
     * @notice Gets active and inactive order IDs in the borrowing order book.
     * @param _user User's address
     */
    function getBorrowOrderIds(address _user)
        external
        view
        override
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        (activeOrderIds, inActiveOrderIds) = OrderBookLogic.getBorrowOrderIds(_user);
    }

    /**
     * @notice Calculates the amount to be filled when executing an order in the order book.
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the user wants to borrow/lend
     * @param _unitPrice Unit price user want to borrow/lend
     * @return filledAmount The amount that is filled on the order book
     * @return filledAmountInFV The amount in the future value that is filled on the order book
     */
    function calculateFilledAmount(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external view override returns (uint256 filledAmount, uint256 filledAmountInFV) {
        return OrderBookLogic.calculateFilledAmount(_side, _amount, _unitPrice);
    }

    /**
     * @notice Opens market
     * @param _maturity The new maturity
     * @param _openingDate The timestamp when the market opens
     * @return prevMaturity The previous maturity updated
     */
    function openMarket(uint256 _maturity, uint256 _openingDate)
        external
        override
        ifMatured
        onlyAcceptedContracts
        returns (uint256 prevMaturity)
    {
        prevMaturity = Storage.slot().maturity;
        Storage.slot().maturity = _maturity;
        Storage.slot().openingDate = _openingDate;

        emit MarketOpened(_maturity, prevMaturity);
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
    {
        (ProtocolTypes.Side side, uint256 removedAmount, uint256 unitPrice) = OrderBookLogic
            .removeOrder(_user, _orderId);

        emit OrderCanceled(
            _orderId,
            _user,
            side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            removedAmount,
            unitPrice
        );
    }

    /**
     * @notice Cleans up own orders to remove order ids that are already filled on the order book.
     * @dev The order list per user is not updated in real-time when an order is filled.
     * This function removes the filled order from that order list per user to reduce gas costs
     * for lazy evaluation if the collateral is enough or not.
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
    function cleanUpOrders(address _user)
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
        ) = OrderBookLogic.cleanLendOrders(_user);

        (
            borrowOrderIds,
            activeBorrowOrderCount,
            removedBorrowOrderFutureValue,
            removedBorrowOrderAmount
        ) = OrderBookLogic.cleanBorrowOrders(_user);

        if (removedLendOrderAmount > 0) {
            emit OrdersCleaned(
                lendOrderIds,
                _user,
                ProtocolTypes.Side.LEND,
                Storage.slot().ccy,
                Storage.slot().maturity,
                removedLendOrderAmount,
                removedLendOrderFutureValue
            );
        }

        if (removedBorrowOrderAmount > 0) {
            emit OrdersCleaned(
                borrowOrderIds,
                _user,
                ProtocolTypes.Side.BORROW,
                Storage.slot().ccy,
                Storage.slot().maturity,
                removedBorrowOrderAmount,
                removedBorrowOrderFutureValue
            );
        }
    }

    /**
     * @notice Executes an order. Takes orders if the order is matched,
     * and places new order if not match it.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the user wants to borrow/lend
     * @param _unitPrice Unit price user wish to borrow/lend
     * @param _circuitBreakerLimitRange Rate limit range for the circuit breaker
     * @return filledOrder User's Filled order of the user
     * @return partiallyFilledOrder Partially filled order on the order book
     */
    function executeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        uint256 _circuitBreakerLimitRange
    )
        external
        override
        whenNotPaused
        onlyAcceptedContracts
        ifOpened
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder)
    {
        require(_amount > 0, "Amount is zero");
        _updateUserMaturity(_user);

        OrderExecutionConditions memory conditions;
        PlacedOrder memory placedOrder;

        (
            conditions.isFilled,
            conditions.executedUnitPrice,
            conditions.cbThresholdUnitPrice,
            conditions.ignoreRemainingAmount
        ) = OrderBookLogic.getOrderExecutionConditions(
            _side,
            _unitPrice,
            _circuitBreakerLimitRange
        );

        if (conditions.isFilled) {
            (filledOrder, partiallyFilledOrder, placedOrder) = _takeOrders(
                _side,
                _user,
                _amount,
                conditions.executedUnitPrice,
                conditions.ignoreRemainingAmount
            );
        } else if (!conditions.ignoreRemainingAmount) {
            placedOrder = PlacedOrder(
                _makeOrder(_side, _user, _amount, conditions.executedUnitPrice),
                _amount,
                conditions.executedUnitPrice
            );
        }

        emit OrderExecuted(
            _user,
            _side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            _amount,
            _unitPrice,
            filledOrder.amount,
            filledOrder.unitPrice,
            filledOrder.futureValue,
            placedOrder.orderId,
            placedOrder.amount,
            placedOrder.unitPrice,
            conditions.cbThresholdUnitPrice
        );
    }

    /**
     * @notice Executes a pre-order. A pre-order will only be accepted from 168 hours (7 days) to 1 hour
     * before the market opens (Pre-order period). At the end of this period, Itayose will be executed.
     *
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Unit price taker wish to borrow/lend
     */
    function executePreOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    ) external override whenNotPaused onlyAcceptedContracts ifPreOrderPeriod {
        require(_amount > 0, "Amount is zero");

        _updateUserMaturity(_user);

        if (
            (_side == ProtocolTypes.Side.LEND && OrderBookLogic.hasBorrowOrder(_user)) ||
            (_side == ProtocolTypes.Side.BORROW && OrderBookLogic.hasLendOrder(_user))
        ) {
            revert("Opposite side order exists");
        }

        uint48 orderId = _makeOrder(_side, _user, _amount, _unitPrice);
        Storage.slot().isPreOrder[orderId] = true;

        emit PreOrderExecuted(
            _user,
            _side,
            Storage.slot().ccy,
            Storage.slot().maturity,
            _amount,
            _unitPrice,
            orderId
        );
    }

    /**
     * @notice Unwinds lending or borrowing positions by a specified future value amount.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _futureValue Amount of future value unwound
     * @param _circuitBreakerLimitRange Rate limit range for the circuit breaker
     * @return filledOrder User's Filled order of the user
     * @return partiallyFilledOrder Partially filled order
     */
    function unwindPosition(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _futureValue,
        uint256 _circuitBreakerLimitRange
    )
        external
        override
        whenNotPaused
        onlyAcceptedContracts
        ifOpened
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder)
    {
        require(_futureValue > 0, "Can't place empty future value amount");

        OrderExecutionConditions memory conditions;
        (
            conditions.isFilled,
            conditions.executedUnitPrice,
            conditions.cbThresholdUnitPrice,
            conditions.ignoreRemainingAmount
        ) = OrderBookLogic.getOrderExecutionConditions(_side, 0, _circuitBreakerLimitRange);

        if (conditions.isFilled) {
            (filledOrder, partiallyFilledOrder) = _unwindPosition(
                _side,
                _futureValue,
                conditions.executedUnitPrice
            );

            emit PositionUnwound(
                _user,
                _side,
                Storage.slot().ccy,
                Storage.slot().maturity,
                _futureValue,
                filledOrder.amount,
                filledOrder.unitPrice,
                filledOrder.futureValue,
                conditions.cbThresholdUnitPrice
            );
        }
    }

    /**
     * @notice Executes Itayose to aggregate pre-orders and determine the opening unit price.
     * After this action, the market opens.
     * @dev If the opening date had already passed when this contract was created, this Itayose need not be executed.
     * @return openingUnitPrice The opening price when Itayose is executed
     * @return totalOffsetAmount The total filled amount when Itayose is executed
     * @return openingDate The timestamp when the market opens
     * @return partiallyFilledLendingOrder Partially filled lending order on the order book
     * @return partiallyFilledBorrowingOrder Partially filled borrowing order on the order book
     */
    function executeItayoseCall()
        external
        override
        whenNotPaused
        onlyAcceptedContracts
        ifItayosePeriod
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        )
    {
        uint256 lastLendUnitPrice;
        uint256 lastBorrowUnitPrice;

        (
            openingUnitPrice,
            lastLendUnitPrice,
            lastBorrowUnitPrice,
            totalOffsetAmount
        ) = OrderBookLogic.getOpeningUnitPrice();

        if (totalOffsetAmount > 0) {
            ProtocolTypes.Side[2] memory sides = [
                ProtocolTypes.Side.LEND,
                ProtocolTypes.Side.BORROW
            ];

            for (uint256 i; i < sides.length; i++) {
                ProtocolTypes.Side partiallyFilledOrderSide;
                (
                    ,
                    ,
                    ,
                    uint48 partiallyFilledOrderId,
                    address partiallyFilledMaker,
                    uint256 partiallyFilledAmount,
                    uint256 partiallyFilledFutureValue,

                ) = OrderBookLogic.dropOrders(sides[i], totalOffsetAmount, 0, 0);

                if (partiallyFilledFutureValue > 0) {
                    if (sides[i] == ProtocolTypes.Side.LEND) {
                        partiallyFilledOrderSide = ProtocolTypes.Side.BORROW;
                        partiallyFilledBorrowingOrder.orderId = partiallyFilledOrderId;
                        partiallyFilledBorrowingOrder.maker = partiallyFilledMaker;
                        partiallyFilledBorrowingOrder.amount = partiallyFilledAmount;
                        partiallyFilledBorrowingOrder.futureValue = partiallyFilledFutureValue;
                    } else {
                        partiallyFilledOrderSide = ProtocolTypes.Side.LEND;
                        partiallyFilledLendingOrder.orderId = partiallyFilledOrderId;
                        partiallyFilledLendingOrder.maker = partiallyFilledMaker;
                        partiallyFilledLendingOrder.amount = partiallyFilledAmount;
                        partiallyFilledLendingOrder.futureValue = partiallyFilledFutureValue;
                    }
                }
            }

            emit ItayoseExecuted(
                Storage.slot().ccy,
                Storage.slot().maturity,
                openingUnitPrice,
                lastLendUnitPrice,
                lastBorrowUnitPrice,
                totalOffsetAmount
            );
        }

        Storage.slot().isReady[Storage.slot().maturity] = true;
        Storage.slot().itayoseLogs[Storage.slot().maturity] = ItayoseLog(
            openingUnitPrice,
            lastLendUnitPrice,
            lastBorrowUnitPrice
        );
        openingDate = Storage.slot().openingDate;
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

    function _updateUserMaturity(address _user) private {
        uint256 userMaturity = Storage.slot().userCurrentMaturities[_user];
        require(
            userMaturity == Storage.slot().maturity ||
                (userMaturity != Storage.slot().maturity &&
                    Storage.slot().activeLendOrderIds[_user].length == 0 &&
                    Storage.slot().activeBorrowOrderIds[_user].length == 0),
            "Order found in past maturity"
        );

        if (userMaturity != Storage.slot().maturity) {
            Storage.slot().userCurrentMaturities[_user] = Storage.slot().maturity;
        }
    }

    /**
     * @notice Makes a new order in the order book.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Preferable interest unit price
     */
    function _makeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    ) private returns (uint48 orderId) {
        orderId = OrderBookLogic.insertOrder(_side, _user, _amount, _unitPrice);
    }

    /**
     * @notice Takes orders in the order book.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Unit price taken
     * @param _ignoreRemainingAmount Boolean for whether to ignore the remaining amount after filling orders
     */
    function _takeOrders(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice,
        bool _ignoreRemainingAmount
    )
        private
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            PlacedOrder memory placedOrder
        )
    {
        uint256 remainingAmount;

        (
            filledOrder.unitPrice,
            ,
            filledOrder.futureValue,
            partiallyFilledOrder.orderId,
            partiallyFilledOrder.maker,
            partiallyFilledOrder.amount,
            partiallyFilledOrder.futureValue,
            remainingAmount
        ) = OrderBookLogic.dropOrders(_side, _amount, 0, _unitPrice);

        filledOrder.amount = _amount - remainingAmount;

        if (remainingAmount > 0) {
            if (_ignoreRemainingAmount) {
                filledOrder.ignoredAmount = remainingAmount;
            } else {
                // Make a new order for the remaining amount of input
                placedOrder = PlacedOrder(
                    _makeOrder(_side, _user, remainingAmount, _unitPrice),
                    remainingAmount,
                    _unitPrice
                );
            }
        }
    }

    function _unwindPosition(
        ProtocolTypes.Side _side,
        uint256 _futureValue,
        uint256 _unitPrice
    )
        private
        returns (FilledOrder memory filledOrder, PartiallyFilledOrder memory partiallyFilledOrder)
    {
        (
            filledOrder.unitPrice,
            filledOrder.amount,
            filledOrder.futureValue,
            partiallyFilledOrder.orderId,
            partiallyFilledOrder.maker,
            partiallyFilledOrder.amount,
            partiallyFilledOrder.futureValue,

        ) = OrderBookLogic.dropOrders(_side, 0, _futureValue, _unitPrice);
    }
}
