// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// interfaces
import {ILendingMarket} from "../protocol/interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../protocol/interfaces/ILendingMarketController.sol";
// libraries
import {Contracts} from "../protocol/libraries/Contracts.sol";
// mixins
import {MixinAddressResolver} from "../protocol/mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "../protocol/types/ProtocolTypes.sol";

contract LendingMarketReader is MixinAddressResolver {
    struct OrderBookDetail {
        bytes32 ccy;
        uint256 maturity;
        uint256 bestLendUnitPrice;
        uint256 bestBorrowUnitPrice;
        uint256 marketUnitPrice;
        uint256[] blockUnitPriceHistory;
        uint256 maxLendUnitPrice;
        uint256 minBorrowUnitPrice;
        uint256 openingUnitPrice;
        uint256 openingDate;
        uint256 preOpeningDate;
        bool isReady;
    }

    struct Position {
        bytes32 ccy;
        uint256 maturity;
        int256 presentValue;
        int256 futureValue;
    }

    struct Order {
        uint48 orderId;
        bytes32 ccy;
        uint256 maturity;
        ProtocolTypes.Side side;
        uint256 unitPrice;
        uint256 amount;
        uint256 timestamp;
        bool isPreOrder;
    }

    constructor(address _resolver) {
        registerAddressResolver(_resolver);
        buildCache();
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @notice Gets the best prices for lending in the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the best prices for lending
     */
    function getBestLendUnitPrices(bytes32 _ccy) external view returns (uint256[] memory) {
        return
            _getLendingMarket(_ccy).getBestLendUnitPrices(
                lendingMarketController().getOrderBookIds(_ccy)
            );
    }

    /**
     * @notice Gets the best prices for borrowing in the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the best prices for borrowing
     */
    function getBestBorrowUnitPrices(bytes32 _ccy) external view returns (uint256[] memory) {
        return
            _getLendingMarket(_ccy).getBestBorrowUnitPrices(
                lendingMarketController().getOrderBookIds(_ccy)
            );
    }

    /**
     * @notice Gets the order book of borrow.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @param _limit The limit number to get
     * @return unitPrices The array of borrow unit prices
     * @return amounts The array of borrow order amounts
     * @return quantities The array of borrow order quantities
     */
    function getBorrowOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        return
            _getLendingMarket(_ccy).getBorrowOrderBook(
                lendingMarketController().getOrderBookId(_ccy, _maturity),
                _limit
            );
    }

    /**
     * @notice Gets the order book of lend.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @param _limit The limit number to get
     * @return unitPrices The array of borrow unit prices
     * @return amounts The array of lend order amounts
     * @return quantities The array of lend order quantities
     */
    function getLendOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        return
            _getLendingMarket(_ccy).getLendOrderBook(
                lendingMarketController().getOrderBookId(_ccy, _maturity),
                _limit
            );
    }

    /**
     * @notice Gets the array of detailed information on the order book
     * @param _ccys Currency name list in bytes32
     * @return orderBookDetails The array of detailed information on the order book.
     */
    function getOrderBookDetails(bytes32[] memory _ccys)
        external
        view
        returns (OrderBookDetail[] memory orderBookDetails)
    {
        uint256 totalCount;

        OrderBookDetail[][] memory detailLists = new OrderBookDetail[][](_ccys.length);

        for (uint256 i; i < _ccys.length; i++) {
            detailLists[i] = getOrderBookDetails(_ccys[i]);
            totalCount += detailLists[i].length;
        }

        orderBookDetails = new OrderBookDetail[](totalCount);
        uint256 index;
        for (uint256 i; i < detailLists.length; i++) {
            for (uint256 j; j < detailLists[i].length; j++) {
                orderBookDetails[index] = detailLists[i][j];
                index++;
            }
        }
    }

    /**
     * @notice Gets the array of detailed information on the order book
     * @param _ccy Currency name in bytes32
     * @return orderBookDetails The array of detailed information on the order book.
     */
    function getOrderBookDetails(bytes32 _ccy)
        public
        view
        returns (OrderBookDetail[] memory orderBookDetails)
    {
        uint256[] memory maturities = lendingMarketController().getMaturities(_ccy);
        orderBookDetails = new OrderBookDetail[](maturities.length);

        for (uint256 i; i < maturities.length; i++) {
            orderBookDetails[i] = getOrderBookDetail(_ccy, maturities[i]);
        }
    }

    /**
     * @notice Gets detailed information on the order book.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @return orderBookDetail The detailed information on the order book.
     */
    function getOrderBookDetail(bytes32 _ccy, uint256 _maturity)
        public
        view
        returns (OrderBookDetail memory orderBookDetail)
    {
        ILendingMarket market = _getLendingMarket(_ccy);
        uint8 orderBookId = lendingMarketController().getOrderBookId(_ccy, _maturity);

        orderBookDetail.ccy = _ccy;
        orderBookDetail.maturity = market.getMaturity(orderBookId);
        orderBookDetail.bestLendUnitPrice = market.getBestLendUnitPrice(orderBookId);
        orderBookDetail.bestBorrowUnitPrice = market.getBestBorrowUnitPrice(orderBookId);
        orderBookDetail.marketUnitPrice = market.getMarketUnitPrice(orderBookId);
        orderBookDetail.blockUnitPriceHistory = market.getBlockUnitPriceHistory(orderBookId);
        orderBookDetail.openingUnitPrice = market.getItayoseLog(_maturity).openingUnitPrice;
        orderBookDetail.isReady = market.isReady(orderBookId);

        (, , orderBookDetail.openingDate, orderBookDetail.preOpeningDate) = market
            .getOrderBookDetail(orderBookId);
        (orderBookDetail.maxLendUnitPrice, orderBookDetail.minBorrowUnitPrice) = market
            .getCircuitBreakerThresholds(orderBookId);
    }

    /**
     * @notice Gets user's active positions of the selected currencies.
     * @param _ccys Currency name list in bytes32
     * @param _user User's address
     * @return positions The array of active positions
     */
    function getPositions(bytes32[] memory _ccys, address _user)
        external
        view
        returns (Position[] memory positions)
    {
        uint256 totalPositionCount;

        Position[][] memory positionLists = new Position[][](_ccys.length);

        for (uint256 i; i < _ccys.length; i++) {
            positionLists[i] = getPositions(_ccys[i], _user);
            totalPositionCount += positionLists[i].length;
        }

        positions = new Position[](totalPositionCount);
        uint256 index;
        for (uint256 i; i < positionLists.length; i++) {
            for (uint256 j; j < positionLists[i].length; j++) {
                positions[index] = positionLists[i][j];
                index++;
            }
        }
    }

    /**
     * @notice Gets user's active positions of the selected currency
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return positions The array of active positions
     */
    function getPositions(bytes32 _ccy, address _user)
        public
        view
        returns (Position[] memory positions)
    {
        uint256[] memory maturities = lendingMarketController().getMaturities(_ccy);
        positions = new Position[](maturities.length);
        uint256 positionIdx;

        for (uint256 i; i < maturities.length; i++) {
            uint256 maturity = maturities[i];
            (int256 presentValue, int256 futureValue) = lendingMarketController().getPosition(
                _ccy,
                maturity,
                _user
            );

            if (futureValue == 0) {
                assembly {
                    mstore(positions, sub(mload(positions), 1))
                }
            } else {
                positions[positionIdx] = Position(_ccy, maturity, presentValue, futureValue);
                positionIdx++;
            }
        }
    }

    /**
     * @notice Gets user's active and inactive orders in the order book
     * @param _ccys Currency name list in bytes32
     * @param _user User's address
     * @return activeOrders The array of active orders in the order book
     * @return inactiveOrders The array of inactive orders
     */
    function getOrders(bytes32[] memory _ccys, address _user)
        external
        view
        returns (Order[] memory activeOrders, Order[] memory inactiveOrders)
    {
        uint256 totalActiveOrderCount;
        uint256 totalInactiveOrderCount;

        Order[][] memory activeOrdersList = new Order[][](_ccys.length);
        Order[][] memory inactiveOrdersList = new Order[][](_ccys.length);

        for (uint256 i; i < _ccys.length; i++) {
            (activeOrdersList[i], inactiveOrdersList[i]) = getOrders(_ccys[i], _user);
            totalActiveOrderCount += activeOrdersList[i].length;
            totalInactiveOrderCount += inactiveOrdersList[i].length;
        }

        activeOrders = _flattenOrders(activeOrdersList, totalActiveOrderCount);
        inactiveOrders = _flattenOrders(inactiveOrdersList, totalInactiveOrderCount);
    }

    /**
     * @notice Gets user's active and inactive orders in the order book by currency
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return activeOrders The array of active orders in the order book
     * @return inactiveOrders The array of inactive orders
     */
    function getOrders(bytes32 _ccy, address _user)
        public
        view
        returns (Order[] memory activeOrders, Order[] memory inactiveOrders)
    {
        uint256 totalActiveOrderCount;
        uint256 totalInactiveOrderCount;

        uint256[] memory maturities = lendingMarketController().getMaturities(_ccy);
        Order[][] memory activeOrdersList = new Order[][](maturities.length);
        Order[][] memory inactiveOrdersList = new Order[][](maturities.length);

        for (uint256 i; i < maturities.length; i++) {
            (activeOrdersList[i], inactiveOrdersList[i]) = getOrders(_ccy, maturities[i], _user);
            totalActiveOrderCount += activeOrdersList[i].length;
            totalInactiveOrderCount += inactiveOrdersList[i].length;
        }

        activeOrders = _flattenOrders(activeOrdersList, totalActiveOrderCount);
        inactiveOrders = _flattenOrders(inactiveOrdersList, totalInactiveOrderCount);
    }

    /**
     * @notice Gets user's active and inactive orders in the order book by maturity
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @param _user User's address
     * @return activeOrders The array of active orders in the order book
     * @return inactiveOrders The array of inactive orders
     */
    function getOrders(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (Order[] memory activeOrders, Order[] memory inactiveOrders) {
        ILendingMarket market = _getLendingMarket(_ccy);
        uint8 orderBookId = lendingMarketController().getOrderBookId(_ccy, _maturity);

        (uint48[] memory activeLendOrderIds, uint48[] memory inActiveLendOrderIds) = market
            .getLendOrderIds(orderBookId, _user);
        (uint48[] memory activeBorrowOrderIds, uint48[] memory inActiveBorrowOrderIds) = market
            .getBorrowOrderIds(orderBookId, _user);

        activeOrders = new Order[](activeLendOrderIds.length + activeBorrowOrderIds.length);
        inactiveOrders = new Order[](inActiveLendOrderIds.length + inActiveBorrowOrderIds.length);

        for (uint256 i; i < activeLendOrderIds.length; i++) {
            activeOrders[i] = _getOrder(_ccy, market, orderBookId, activeLendOrderIds[i]);
        }

        for (uint256 i; i < activeBorrowOrderIds.length; i++) {
            activeOrders[activeLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                orderBookId,
                activeBorrowOrderIds[i]
            );
        }

        for (uint256 i; i < inActiveLendOrderIds.length; i++) {
            inactiveOrders[i] = _getOrder(_ccy, market, orderBookId, inActiveLendOrderIds[i]);
        }

        for (uint256 i; i < inActiveBorrowOrderIds.length; i++) {
            inactiveOrders[inActiveLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                orderBookId,
                inActiveBorrowOrderIds[i]
            );
        }
    }

    function _getOrder(
        bytes32 _ccy,
        ILendingMarket _market,
        uint8 _orderBookId,
        uint48 _orderId
    ) internal view returns (Order memory order) {
        (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            ,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        ) = _market.getOrder(_orderBookId, _orderId);

        order = Order(_orderId, _ccy, maturity, side, unitPrice, amount, timestamp, isPreOrder);
    }

    function _getLendingMarket(bytes32 _ccy) internal view returns (ILendingMarket) {
        return ILendingMarket(lendingMarketController().getLendingMarket(_ccy));
    }

    function _flattenOrders(Order[][] memory orders, uint256 totalLength)
        internal
        pure
        returns (Order[] memory flattened)
    {
        flattened = new Order[](totalLength);
        uint256 index;
        for (uint256 i; i < orders.length; i++) {
            for (uint256 j; j < orders[i].length; j++) {
                flattened[index] = orders[i][j];
                index++;
            }
        }
    }
}
