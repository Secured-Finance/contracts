// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

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
        uint256 lastBlockUnitPriceTimestamp;
        uint256 maxLendUnitPrice;
        uint256 minBorrowUnitPrice;
        uint256 openingUnitPrice;
        uint256 openingDate;
        uint256 preOpeningDate;
        uint256 currentMinDebtUnitPrice;
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
                lendingMarketController().getMaturities(_ccy)
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
                lendingMarketController().getMaturities(_ccy)
            );
    }

    /**
     * @notice Gets the order book of borrow orders.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @param _start The starting unit price to get order book
     * @param _limit The max limit for getting unit prices
     * @return unitPrices The array of order unit prices
     * @return amounts The array of order amounts
     * @return quantities The array of order quantities
     * @return next The next starting unit price to get order book
     */
    function getBorrowOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _start,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        )
    {
        return _getLendingMarket(_ccy).getBorrowOrderBook(_maturity, _start, _limit);
    }

    /**
     * @notice Gets the order book of lend orders.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @param _start The starting unit price to get order book
     * @param _limit The max limit for getting unit prices
     * @return unitPrices The array of order unit prices
     * @return amounts The array of order amounts
     * @return quantities The array of order quantities
     * @return next The next starting unit price to get order book
     */
    function getLendOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _start,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities,
            uint256 next
        )
    {
        return _getLendingMarket(_ccy).getLendOrderBook(_maturity, _start, _limit);
    }

    /**
     * @notice Gets the estimation of the Itayose process.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the order book
     * @return openingUnitPrice The opening price when Itayose is executed
     * @return lastLendUnitPrice The price of the last lend order filled by Itayose.
     * @return lastBorrowUnitPrice The price of the last borrow order filled by Itayose.
     * @return totalOffsetAmount The total amount of the orders filled by Itayose.
     */
    function getItayoseEstimation(
        bytes32 _ccy,
        uint256 _maturity
    )
        public
        view
        returns (
            uint256 openingUnitPrice,
            uint256 lastLendUnitPrice,
            uint256 lastBorrowUnitPrice,
            uint256 totalOffsetAmount
        )
    {
        (
            openingUnitPrice,
            lastLendUnitPrice,
            lastBorrowUnitPrice,
            totalOffsetAmount
        ) = _getLendingMarket(_ccy).getItayoseEstimation(_maturity);
    }

    /**
     * @notice Gets the array of detailed information on the order book
     * @param _ccys Currency name list in bytes32
     * @return orderBookDetails The array of detailed information on the order book.
     */
    function getOrderBookDetails(
        bytes32[] memory _ccys
    ) external view returns (OrderBookDetail[] memory orderBookDetails) {
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
    function getOrderBookDetails(
        bytes32 _ccy
    ) public view returns (OrderBookDetail[] memory orderBookDetails) {
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
    function getOrderBookDetail(
        bytes32 _ccy,
        uint256 _maturity
    ) public view returns (OrderBookDetail memory orderBookDetail) {
        ILendingMarket market = _getLendingMarket(_ccy);

        orderBookDetail.ccy = _ccy;
        orderBookDetail.maturity = _maturity;
        orderBookDetail.bestLendUnitPrice = market.getBestLendUnitPrice(_maturity);
        orderBookDetail.bestBorrowUnitPrice = market.getBestBorrowUnitPrice(_maturity);
        orderBookDetail.marketUnitPrice = market.getMarketUnitPrice(_maturity);
        orderBookDetail.isReady = market.isReady(_maturity);

        (
            orderBookDetail.blockUnitPriceHistory,
            orderBookDetail.lastBlockUnitPriceTimestamp
        ) = market.getBlockUnitPriceHistory(_maturity);

        (, orderBookDetail.openingDate, orderBookDetail.preOpeningDate) = market.getOrderBookDetail(
            _maturity
        );
        (orderBookDetail.maxLendUnitPrice, orderBookDetail.minBorrowUnitPrice) = market
            .getCircuitBreakerThresholds(_maturity);

        if (orderBookDetail.isReady) {
            orderBookDetail.openingUnitPrice = market.getItayoseLog(_maturity).openingUnitPrice;
        } else {
            (orderBookDetail.openingUnitPrice, , , ) = market.getItayoseEstimation(_maturity);
        }

        orderBookDetail.currentMinDebtUnitPrice = lendingMarketController()
            .getCurrentMinDebtUnitPrice(_ccy, _maturity);
    }

    /**
     * @notice Gets user's active positions of the selected currencies.
     * @param _ccys Currency name list in bytes32
     * @param _user User's address
     * @return positions The array of active positions
     */
    function getPositions(
        bytes32[] memory _ccys,
        address _user
    ) external view returns (Position[] memory positions) {
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
    function getPositions(
        bytes32 _ccy,
        address _user
    ) public view returns (Position[] memory positions) {
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
    function getOrders(
        bytes32[] memory _ccys,
        address _user
    ) external view returns (Order[] memory activeOrders, Order[] memory inactiveOrders) {
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
    function getOrders(
        bytes32 _ccy,
        address _user
    ) public view returns (Order[] memory activeOrders, Order[] memory inactiveOrders) {
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

        (uint48[] memory activeLendOrderIds, uint48[] memory inActiveLendOrderIds) = market
            .getLendOrderIds(_maturity, _user);
        (uint48[] memory activeBorrowOrderIds, uint48[] memory inActiveBorrowOrderIds) = market
            .getBorrowOrderIds(_maturity, _user);

        activeOrders = new Order[](activeLendOrderIds.length + activeBorrowOrderIds.length);
        inactiveOrders = new Order[](inActiveLendOrderIds.length + inActiveBorrowOrderIds.length);

        for (uint256 i; i < activeLendOrderIds.length; i++) {
            activeOrders[i] = _getOrder(_ccy, market, _maturity, activeLendOrderIds[i]);
        }

        for (uint256 i; i < activeBorrowOrderIds.length; i++) {
            activeOrders[activeLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                _maturity,
                activeBorrowOrderIds[i]
            );
        }

        for (uint256 i; i < inActiveLendOrderIds.length; i++) {
            inactiveOrders[i] = _getOrder(_ccy, market, _maturity, inActiveLendOrderIds[i]);
        }

        for (uint256 i; i < inActiveBorrowOrderIds.length; i++) {
            inactiveOrders[inActiveLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                _maturity,
                inActiveBorrowOrderIds[i]
            );
        }
    }

    function _getOrder(
        bytes32 _ccy,
        ILendingMarket _market,
        uint256 _maturity,
        uint48 _orderId
    ) internal view returns (Order memory order) {
        (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            ,
            uint256 amount,
            uint256 timestamp,
            bool isPreOrder
        ) = _market.getOrder(_maturity, _orderId);

        order = Order(_orderId, _ccy, _maturity, side, unitPrice, amount, timestamp, isPreOrder);
    }

    function _getLendingMarket(bytes32 _ccy) internal view returns (ILendingMarket) {
        return ILendingMarket(lendingMarketController().getLendingMarket(_ccy));
    }

    function _flattenOrders(
        Order[][] memory orders,
        uint256 totalLength
    ) internal pure returns (Order[] memory flattened) {
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
