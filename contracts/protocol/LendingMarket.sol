// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

// interfaces
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {Constants} from "./libraries/Constants.sol";
import {OrderActionLogic} from "./libraries/logics/OrderActionLogic.sol";
import {OrderBookLogic} from "./libraries/logics/OrderBookLogic.sol";
import {OrderReaderLogic} from "./libraries/logics/OrderReaderLogic.sol";
import {RoundingUint256} from "./libraries/math/RoundingUint256.sol";
import {FilledOrder, PartiallyFilledOrder} from "./libraries/OrderBookLib.sol";
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
 * @notice Implements the module that allows order book participants to execute/cancel/unwind orders.
 *
 * For updates, this contract is basically called from `LendingMarketController.sol`instead of being called
 * directly by the user.
 *
 * @dev Open orders is stored in structured red-black trees and doubly linked lists in each node.
 */
contract LendingMarket is ILendingMarket, MixinAddressResolver, Pausable, Proxyable {
    using RoundingUint256 for uint256;

    /// @dev Used for minimum reliable amount in base currency for block unit price
    uint256 immutable MINIMUM_RELIABLE_AMOUNT_IN_BASE_CURRENCY;

    /**
     * @notice Modifier to make a function callable only by order maker.
     * @param _maturity The maturity of the order book
     * @param _user User's address
     * @param _orderId Market order id
     */
    modifier onlyMaker(
        uint256 _maturity,
        address _user,
        uint48 _orderId
    ) {
        (, , address maker, , , ) = getOrder(_maturity, _orderId);
        if (maker == address(0)) revert NoOrderExists();
        if (_user != maker) revert CallerNotMaker();
        _;
    }

    /**
     * @notice Modifier to check if the market is opened.
     * @param _maturity The maturity of the order book
     */
    modifier ifOpened(uint256 _maturity) {
        if (!isOpened(_maturity)) revert MarketNotOpened();
        _;
    }

    /**
     * @notice Modifier to check if the market is under the Itayose period.
     * @param _maturity The maturity of the order book
     */
    modifier ifItayosePeriod(uint256 _maturity) {
        if (!isItayosePeriod(_maturity)) revert NotItayosePeriod();
        _;
    }

    /**
     * @notice Modifier to check if the market is not under the Itayose period.
     * @param _maturity The maturity of the order book
     */
    modifier ifNotItayosePeriod(uint256 _maturity) {
        if (isItayosePeriod(_maturity)) revert AlreadyItayosePeriod();
        _;
    }

    /**
     * @notice Modifier to check if the market is under the pre-order period.
     * @param _maturity The maturity of the order book
     */
    modifier ifPreOrderPeriod(uint256 _maturity) {
        if (!isPreOrderPeriod(_maturity)) revert NotPreOrderPeriod();
        _;
    }

    /**
     * @notice Contract constructor function.
     * @param _minimumReliableAmount The minimum reliable amount the base currency for calculating block unit price
     */
    constructor(uint256 _minimumReliableAmount) {
        MINIMUM_RELIABLE_AMOUNT_IN_BASE_CURRENCY = _minimumReliableAmount;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _resolver The address of the Address Resolver contract
     * @param _ccy The main currency for the order book
     */
    function initialize(
        address _resolver,
        bytes32 _ccy,
        uint256 _orderFeeRate,
        uint256 _cbLimitRange
    ) public initializer onlyBeacon {
        registerAddressResolver(_resolver);
        Storage.slot().ccy = _ccy;

        OrderBookLogic.updateOrderFeeRate(_orderFeeRate);
        OrderBookLogic.updateCircuitBreakerLimitRange(_cbLimitRange);

        buildCache();
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @notice Gets if the market is ready.
     * @param _maturity The maturity of the order book
     * @return The boolean if the market is ready or not
     */
    function isReady(uint256 _maturity) public view override returns (bool) {
        return OrderBookLogic.isReady(_maturity);
    }

    /**
     * @notice Gets if the market is matured.
     * @param _maturity The maturity of the order book
     * @return The boolean if the market is matured or not
     */
    function isMatured(uint256 _maturity) public view override returns (bool) {
        return OrderBookLogic.isMatured(_maturity);
    }

    /**
     * @notice Gets if the market is opened.
     * @param _maturity The maturity of the order book
     * @return The boolean if the market is opened or not
     */
    function isOpened(uint256 _maturity) public view override returns (bool) {
        return OrderBookLogic.isOpened(_maturity);
    }

    /**
     * @notice Gets if the market is under the Itayose period.
     * @param _maturity The maturity of the order book
     * @return The boolean if the market is under the Itayose period.
     */
    function isItayosePeriod(uint256 _maturity) public view returns (bool) {
        return OrderBookLogic.isItayosePeriod(_maturity);
    }

    /**
     * @notice Gets if the market is under the pre-order period.
     * @param _maturity The maturity of the order book
     * @return The boolean if the market is under the pre-order period.
     */
    function isPreOrderPeriod(uint256 _maturity) public view override returns (bool) {
        return OrderBookLogic.isPreOrderPeriod(_maturity);
    }

    /**
     * @notice Gets the order book detail.
     * @param _maturity The maturity of the order book
     * @return ccy The currency of the order book
     * @return openingDate The opening date of the order book
     * @return preOpeningDate The pre-opening date of the order book
     */
    function getOrderBookDetail(
        uint256 _maturity
    ) public view override returns (bytes32 ccy, uint256 openingDate, uint256 preOpeningDate) {
        return OrderBookLogic.getOrderBookDetail(_maturity);
    }

    /**
     * @notice Gets unit price Thresholds by CircuitBreaker.
     * @param _maturity The maturity of the order book
     * @return maxLendUnitPrice The maximum unit price for lending
     * @return minBorrowUnitPrice The minimum unit price for borrowing
     */
    function getCircuitBreakerThresholds(
        uint256 _maturity
    ) external view override returns (uint256 maxLendUnitPrice, uint256 minBorrowUnitPrice) {
        return OrderBookLogic.getCircuitBreakerThresholds(_maturity);
    }

    /**
     * @notice Gets the best price for lending.
     * @param _maturity The maturity of the order book
     * @return The best price for lending
     */
    function getBestLendUnitPrice(uint256 _maturity) public view override returns (uint256) {
        return OrderBookLogic.getBestLendUnitPrice(_maturity);
    }

    /**
     * @notice Gets the best prices for lending.
     * @return The array of the best price for lending
     */
    function getBestLendUnitPrices(
        uint256[] calldata _maturities
    ) external view override returns (uint256[] memory) {
        return OrderBookLogic.getBestLendUnitPrices(_maturities);
    }

    /**
     * @notice Gets the best price for borrowing.
     * @param _maturity The maturity of the order book
     * @return The best price for borrowing
     */
    function getBestBorrowUnitPrice(uint256 _maturity) public view override returns (uint256) {
        return OrderBookLogic.getBestBorrowUnitPrice(_maturity);
    }

    /**
     * @notice Gets the best prices for borrowing.
     * @return The array of the best price for borrowing
     */
    function getBestBorrowUnitPrices(
        uint256[] calldata _maturities
    ) external view override returns (uint256[] memory) {
        return OrderBookLogic.getBestBorrowUnitPrices(_maturities);
    }

    /**
     * @notice Gets the market unit price
     * @param _maturity The maturity of the order book
     * @return The market unit price
     */
    function getMarketUnitPrice(uint256 _maturity) external view override returns (uint256) {
        return OrderBookLogic.getMarketUnitPrice(_maturity);
    }

    /**
     * @notice Gets the block timestamp of the last filled order.
     * @param _maturity The maturity of the order book
     * @return The block number
     */
    function getLastOrderTimestamp(uint256 _maturity) external view override returns (uint48) {
        return OrderBookLogic.getLastOrderTimestamp(_maturity);
    }

    /**
     * @notice Gets the block unit price history
     * @param _maturity The maturity of the order book
     * @return unitPrices The array of the block unit price
     * @return timestamp Timestamp of the last block unit price
     */
    function getBlockUnitPriceHistory(
        uint256 _maturity
    ) external view override returns (uint256[] memory unitPrices, uint48 timestamp) {
        return OrderBookLogic.getBlockUnitPriceHistory(_maturity);
    }

    /**
     * @notice Gets the block unit price average.
     * @param _maturity The maturity of the order book
     * @param _count Count of data used for averaging
     * @return The block unit price average
     */
    function getBlockUnitPriceAverage(
        uint256 _maturity,
        uint256 _count
    ) external view override returns (uint256) {
        return OrderBookLogic.getBlockUnitPriceAverage(_maturity, _count);
    }

    /**
     * @notice Gets the order book of borrow orders.
     * This function supports pagination. If a unit price is specified in `_start`,
     * the orders are returned for the _limit from there. The unit price that can be
     * set to `_start` of the next data fetching is set to the return value, `next`.
     * If `_start` is 0, this function returns from the first order.
     * @param _maturity The maturity of the order book
     * @param _start The starting unit price to get order book
     * @param _limit The max limit for getting unit prices
     * @return unitPrices The array of order unit prices
     * @return amounts The array of order amounts
     * @return quantities The array of order quantities
     * @return next The next starting unit price to get order book
     */
    function getBorrowOrderBook(
        uint256 _maturity,
        uint256 _start,
        uint256 _limit
    )
        external
        view
        override
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        )
    {
        return OrderBookLogic.getBorrowOrderBook(_maturity, _start, _limit);
    }

    /**
     * @notice Gets the order book of lend orders.
     * This function supports pagination. If a unit price is specified in `_start`,
     * the orders are returned for the _limit from there. The unit price that can be
     * set to `_start` of the next data fetching is set to the return value, `next`.
     * If `_start` is 0, this function returns from the first order.
     * @param _maturity The maturity of the order book
     * @param _start The starting unit price to get order book
     * @param _limit The max limit for getting unit prices
     * @return unitPrices The array of order unit prices
     * @return amounts The array of order amounts
     * @return quantities The array of order quantities
     * @return next The next starting unit price to get order book
     */
    function getLendOrderBook(
        uint256 _maturity,
        uint256 _start,
        uint256 _limit
    )
        external
        view
        override
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        )
    {
        return OrderBookLogic.getLendOrderBook(_maturity, _start, _limit);
    }

    /**
     * @notice Gets the estimation of the Itayose process.
     * @param _maturity The maturity of the order book
     * @return openingUnitPrice The opening price when Itayose is executed
     * @return lastLendUnitPrice The price of the last lend order filled by Itayose.
     * @return lastBorrowUnitPrice The price of the last borrow order filled by Itayose.
     * @return totalOffsetAmount The total amount of the orders filled by Itayose.
     */
    function getItayoseEstimation(
        uint256 _maturity
    )
        external
        view
        returns (
            uint256 openingUnitPrice,
            uint256 lastLendUnitPrice,
            uint256 lastBorrowUnitPrice,
            uint256 totalOffsetAmount
        )
    {
        return OrderBookLogic.getItayoseEstimation(_maturity);
    }

    /**
     * @notice Gets the market currency.
     * @return currency The market currency
     */
    function getCurrency() external view override returns (bytes32 currency) {
        return Storage.slot().ccy;
    }

    /**
     * @notice Gets the order fee rate
     * @return The order fee rate received by protocol
     */
    function getOrderFeeRate() external view override returns (uint256) {
        return Storage.slot().orderFeeRate;
    }

    /**
     * @notice Gets the limit range in unit price for the circuit breaker
     * @return The limit range in unit price for the circuit breaker
     */
    function getCircuitBreakerLimitRange() external view override returns (uint256) {
        return Storage.slot().circuitBreakerLimitRange;
    }

    /**
     * @notice Gets the market opening date.
     * @param _maturity The maturity of the order book
     * @return openingDate The market opening date
     */
    function getOpeningDate(uint256 _maturity) public view override returns (uint256 openingDate) {
        return Storage.slot().orderBooks[_maturity].openingDate;
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
     * @param _maturity The maturity of the order book
     * @param _orderId The market order id
     * @return side Order position type, Borrow or Lend
     * @return unitPrice Amount of interest unit price
     * @return maker The order maker
     * @return amount Order amount
     * @return timestamp Timestamp when the order was created
     * @return isPreOrder The boolean if the order is a pre-order.
     */
    function getOrder(
        uint256 _maturity,
        uint48 _orderId
    )
        public
        view
        override
        returns (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            address maker,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        )
    {
        return OrderReaderLogic.getOrder(_maturity, _orderId);
    }

    /**
     * @notice Calculates and gets the active and inactive amounts from the user orders of lending deals.
     * @param _maturity The maturity of the order book
     * @param _user User's address
     * @return activeAmount The total amount of active order on the order book
     * @return inactiveAmount The total amount of inactive orders filled on the order book
     * @return inactiveFutureValue The total future value amount of inactive orders filled on the order book
     */
    function getTotalAmountFromLendOrders(
        uint256 _maturity,
        address _user
    )
        external
        view
        override
        returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue)
    {
        return OrderReaderLogic.getTotalAmountFromLendOrders(_maturity, _user);
    }

    /**
     * @notice Calculates and gets the active and inactive amounts from the user orders of borrowing deals.
     * @param _maturity The maturity of the order book
     * @param _user User's address
     * @return activeAmount The total amount of active order on the order book
     * @return inactiveAmount The total amount of inactive orders filled on the order book
     * @return inactiveFutureValue The total future value amount of inactive orders filled on the order book
     */
    function getTotalAmountFromBorrowOrders(
        uint256 _maturity,
        address _user,
        uint256 _minUnitPrice
    )
        external
        view
        override
        returns (uint256 activeAmount, uint256 inactiveAmount, uint256 inactiveFutureValue)
    {
        return OrderReaderLogic.getTotalAmountFromBorrowOrders(_maturity, _user, _minUnitPrice);
    }

    /**
     * @notice Gets active and inactive order IDs in the lending order book.
     * @param _maturity The maturity of the order book
     * @param _user User's address
     */
    function getLendOrderIds(
        uint256 _maturity,
        address _user
    )
        external
        view
        override
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        return OrderReaderLogic.getLendOrderIds(_maturity, _user);
    }

    /**
     * @notice Gets active and inactive order IDs in the borrowing order book.
     * @param _maturity The maturity of the order book
     * @param _user User's address
     */
    function getBorrowOrderIds(
        uint256 _maturity,
        address _user
    )
        external
        view
        override
        returns (uint48[] memory activeOrderIds, uint48[] memory inActiveOrderIds)
    {
        return OrderReaderLogic.getBorrowOrderIds(_maturity, _user);
    }

    /**
     * @notice Calculates the amount to be filled when executing an order in the order book.
     * @param _maturity The maturity of the order book
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the user wants to borrow/lend
     * @param _unitPrice Unit price user want to borrow/lend
     * @return lastUnitPrice The last unit price that is filled on the order book
     * @return filledAmount The amount that is filled on the order book
     * @return filledAmountInFV The amount in the future value that is filled on the order book
     * @return orderFeeInFV The order fee amount in the future value
     * @return placedAmount The amount that is placed to the order book
     */
    function calculateFilledAmount(
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        external
        view
        override
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV,
            uint256 placedAmount
        )
    {
        return OrderReaderLogic.calculateFilledAmount(_maturity, _side, _amount, _unitPrice);
    }

    /**
     * @notice Creates a new order book.
     * @param _maturity The initial maturity of the order book
     * @param _openingDate The timestamp when the order book opens
     * @param _preOpeningDate The timestamp when the order book pre-opens
     */
    function createOrderBook(
        uint256 _maturity,
        uint256 _openingDate,
        uint256 _preOpeningDate
    ) external override onlyLendingMarketController {
        return OrderBookLogic.createOrderBook(_maturity, _openingDate, _preOpeningDate);
    }

    function executeAutoRoll(
        uint256 _maturedOrderBookMaturity,
        uint256 _destinationOrderBookMaturity,
        uint256 _autoRollUnitPrice
    ) external override onlyLendingMarketController {
        OrderBookLogic.executeAutoRoll(
            _maturedOrderBookMaturity,
            _destinationOrderBookMaturity,
            _autoRollUnitPrice
        );
    }

    /**
     * @notice Cancels the order.
     * @param _maturity The maturity of the order book
     * @param _user User address
     * @param _orderId Market order id
     */
    function cancelOrder(
        uint256 _maturity,
        address _user,
        uint48 _orderId
    )
        external
        override
        whenNotPaused
        onlyLendingMarketController
        onlyMaker(_maturity, _user, _orderId)
        ifNotItayosePeriod(_maturity)
    {
        OrderActionLogic.cancelOrder(_maturity, _user, _orderId);
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
     */
    function cleanUpOrders(
        uint256 _maturity,
        address _user
    )
        external
        override
        onlyLendingMarketController
        returns (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 removedLendOrderAmount,
            uint256 removedBorrowOrderAmount
        )
    {
        return OrderActionLogic.cleanUpOrders(_maturity, _user);
    }

    /**
     * @notice Executes an order. Takes orders if the order is matched,
     * and places new order if not match it.
     * @param _maturity The maturity of the order book
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the user wants to borrow/lend
     * @param _unitPrice Unit price user wish to borrow/lend
     * @return filledOrder User's Filled order of the user
     * @return partiallyFilledOrder Partially filled order on the order book
     */
    function executeOrder(
        uint256 _maturity,
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    )
        external
        override
        whenNotPaused
        onlyLendingMarketController
        ifOpened(_maturity)
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV
        )
    {
        return
            OrderActionLogic.executeOrder(
                _maturity,
                _side,
                _user,
                _amount,
                _unitPrice,
                currencyController().convertFromBaseCurrency(
                    Storage.slot().ccy,
                    MINIMUM_RELIABLE_AMOUNT_IN_BASE_CURRENCY
                )
            );
    }

    /**
     * @notice Executes a pre-order. A pre-order will only be accepted from 168 hours (7 days) to 1 hour
     * before the market opens (Pre-order period). At the end of this period, Itayose will be executed.
     *
     * @param _maturity The maturity of the order book
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Unit price taker wish to borrow/lend
     */
    function executePreOrder(
        uint256 _maturity,
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _unitPrice
    ) external override whenNotPaused onlyLendingMarketController ifPreOrderPeriod(_maturity) {
        OrderActionLogic.executePreOrder(_maturity, _side, _user, _amount, _unitPrice);
    }

    /**
     * @notice Unwinds lending or borrowing positions by a specified future value amount.
     * @param _maturity The maturity of the order book
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _futureValue Amount of future value unwound
     * @return filledOrder User's Filled order of the user
     * @return partiallyFilledOrder Partially filled order
     */
    function unwindPosition(
        uint256 _maturity,
        ProtocolTypes.Side _side,
        address _user,
        uint256 _futureValue
    )
        external
        override
        whenNotPaused
        onlyLendingMarketController
        ifOpened(_maturity)
        returns (
            FilledOrder memory filledOrder,
            PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 feeInFV
        )
    {
        return
            OrderActionLogic.unwindPosition(
                _maturity,
                _side,
                _user,
                _futureValue,
                currencyController().convertFromBaseCurrency(
                    Storage.slot().ccy,
                    MINIMUM_RELIABLE_AMOUNT_IN_BASE_CURRENCY
                )
            );
    }

    /**
     * @notice Executes Itayose to aggregate pre-orders and determine the opening unit price.
     * After this action, the market opens.
     * @dev If the opening date had already passed when this contract was created, this Itayose need not be executed.
     * @param _maturity The maturity of the order book
     * @return openingUnitPrice The opening price when Itayose is executed
     * @return totalOffsetAmount The total filled amount when Itayose is executed
     * @return openingDate The timestamp when the market opens
     * @return partiallyFilledLendingOrder Partially filled lending order on the order book
     * @return partiallyFilledBorrowingOrder Partially filled borrowing order on the order book
     */
    function executeItayoseCall(
        uint256 _maturity
    )
        external
        override
        whenNotPaused
        onlyLendingMarketController
        ifItayosePeriod(_maturity)
        returns (
            uint256 openingUnitPrice,
            uint256 totalOffsetAmount,
            uint256 openingDate,
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        )
    {
        return OrderBookLogic.executeItayoseCall(_maturity);
    }

    /**
     * @notice Updates the order fee rate
     * @param _orderFeeRate The order fee rate received by protocol
     */
    function updateOrderFeeRate(
        uint256 _orderFeeRate
    ) external override onlyLendingMarketController {
        OrderBookLogic.updateOrderFeeRate(_orderFeeRate);
    }

    /**
     * @notice Updates the auto-roll fee rate
     * @param _cbLimitRange The circuit breaker limit range
     */
    function updateCircuitBreakerLimitRange(
        uint256 _cbLimitRange
    ) external override onlyLendingMarketController {
        OrderBookLogic.updateCircuitBreakerLimitRange(_cbLimitRange);
    }

    /**
     * @notice Pauses the lending market.
     */
    function pause() external override onlyLendingMarketController {
        _pause();
    }

    /**
     * @notice Unpauses the lending market.
     */
    function unpause() external override onlyLendingMarketController {
        _unpause();
    }
}
