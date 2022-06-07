// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/ILendingMarket.sol";
import "./interfaces/ILoanV2.sol";
import "./libraries/HitchensOrderStatisticsTreeLib.sol";
import "./mixins/MixinAddressResolver.sol";
import "./types/ProtocolTypes.sol";

/**
 * @dev Lending Market contract module which allows lending market participants
 * to create/take/cancel market orders.
 *
 * It will store market orders in structured red-black tree and doubly linked list in each node.
 */
contract LendingMarket is ILendingMarket, MixinAddressResolver, ReentrancyGuard, Pausable {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    bytes4 constant prefix = 0x21aaa47b;
    uint256 public last_order_id;
    bytes32 public MarketCcy;
    uint256 public MarketTerm;

    /**
     * @dev Order Book mapping for all Market Orders.
     */
    mapping(uint256 => MarketOrder) public orders;
    HitchensOrderStatisticsTreeLib.Tree lendOrders;
    HitchensOrderStatisticsTreeLib.Tree borrowOrders;

    /**
     * @dev Constructor.
     * @param _ccy The main currency for order book lending deals
     * @param _term The main term for order book lending deals
     */
    constructor(
        address _resolver,
        bytes32 _ccy,
        uint256 _term
    ) MixinAddressResolver(_resolver) {
        MarketCcy = _ccy;
        MarketTerm = _term;
        buildCache();
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](3);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
        contracts[2] = Contracts.PRODUCT_ADDRESS_RESOLVER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @dev Modifier to make a function callable only by order maker.
     * @param orderId Market order id
     */
    modifier onlyMaker(uint256 orderId) {
        require(msg.sender == getMaker(orderId), "No access to cancel order");
        _;
    }

    /**
     * @dev Triggers to get order maker address.
     * @param orderId Market order id
     */
    function getMaker(uint256 orderId) public view override returns (address maker) {
        return orders[orderId].maker;
    }

    /**
     * @dev Triggers to get highest borrow rate.
     */
    function getBorrowRate() public view override returns (uint256 rate) {
        return borrowOrders.last();
    }

    /**
     * @dev Triggers to get highest lend rate.
     */
    function getLendRate() public view override returns (uint256 rate) {
        return lendOrders.last();
    }

    /**
     * @dev Triggers to get mid rate.
     */
    function getMidRate() public view override returns (uint256 rate) {
        uint256 borrowRate = getBorrowRate();
        uint256 lendRate = getLendRate();
        uint256 combinedRate = borrowRate + lendRate;

        return combinedRate / 2;
    }

    /**
     * @dev Triggers to get market order information.
     * @param orderId Market order id
     */
    function getOrder(uint256 orderId) public view override returns (MarketOrder memory) {
        return orders[orderId];
    }

    function getOrderFromTree(uint256 orderId)
        public
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        MarketOrder memory marketOrder = orders[orderId];

        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            return lendOrders.getOrderById(marketOrder.rate, orderId);
        } else {
            return borrowOrders.getOrderById(marketOrder.rate, orderId);
        }
    }

    /**
     * @dev Internally triggered to increase and return id of last order in order book.
     */
    function _next_id() internal returns (uint256) {
        last_order_id++;
        return last_order_id;
    }

    /**
     * @dev Triggered to cancel market order.
     * @param orderId Market order id
     *
     * Requirements:
     * - Order has to be cancelable by market maker
     */
    function cancelOrder(uint256 orderId)
        public
        override
        onlyMaker(orderId)
        returns (bool success)
    {
        _beforeMarketOrder();

        MarketOrder memory marketOrder = orders[orderId];
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            lendOrders.remove(marketOrder.amount, marketOrder.rate, orderId);
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            borrowOrders.remove(marketOrder.amount, marketOrder.rate, orderId);
        }
        delete orders[orderId];

        collateralAggregator().releaseUnsettledCollateral(
            marketOrder.maker,
            MarketCcy,
            (marketOrder.amount * ProtocolTypes.MKTMAKELEVEL) / ProtocolTypes.PCT
        );
        emit CancelOrder(
            orderId,
            marketOrder.maker,
            marketOrder.side,
            marketOrder.amount,
            marketOrder.rate
        );

        success = true;
    }

    /**
     * @dev Triggered to make new market order.
     * @param _side Borrow or Lend order position
     * @param _amount Amount of funds maker wish to borrow/lend
     * @param _rate Preferable interest rate
     */
    function makeOrder(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) internal returns (uint256 orderId) {
        MarketOrder memory marketOrder;

        require(_amount > 0, "Can't place empty amount");
        require(_rate > 0, "Can't place empty rate");
        _beforeMarketOrder();

        marketOrder.side = _side;
        marketOrder.amount = _amount;
        marketOrder.rate = _rate;
        marketOrder.maker = msg.sender;
        orderId = _next_id();

        orders[orderId] = marketOrder;
        collateralAggregator().useUnsettledCollateral(
            msg.sender,
            MarketCcy,
            (_amount * ProtocolTypes.MKTMAKELEVEL) / ProtocolTypes.PCT
        );
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            lendOrders.insert(marketOrder.amount, marketOrder.rate, orderId);
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            borrowOrders.insert(marketOrder.amount, marketOrder.rate, orderId);
        }

        emit MakeOrder(
            orderId,
            marketOrder.maker,
            marketOrder.side,
            MarketCcy,
            MarketTerm,
            marketOrder.amount,
            marketOrder.rate
        );
    }

    /**
     * @dev Triggered to take market order.
     * @param orderId Market Order id in Order Book
     * @param _amount Amount of funds taker wish to borrow/lend
     *
     * Requirements:
     * - Market order has to be active
     */
    function takeOrder(
        ProtocolTypes.Side side,
        uint256 orderId,
        uint256 _amount
    ) internal returns (bool) {
        MarketOrder memory marketOrder = orders[orderId];
        require(_amount <= marketOrder.amount, "Insuficient amount");
        require(marketOrder.maker != msg.sender, "Maker couldn't take its order");
        _beforeMarketOrder();

        orders[orderId].amount = marketOrder.amount - _amount;
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            require(
                lendOrders.fillOrder(marketOrder.rate, orderId, _amount),
                "Couldn't fill order"
            );
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            require(
                borrowOrders.fillOrder(marketOrder.rate, orderId, _amount),
                "Couldn't fill order"
            );
        }

        address productAddress = productAddressResolver().getProductContract(prefix);

        ILoanV2(productAddress).register(
            marketOrder.maker,
            msg.sender,
            uint8(marketOrder.side),
            MarketCcy,
            MarketTerm,
            _amount,
            marketOrder.rate
        );

        emit TakeOrder(orderId, msg.sender, side, _amount, marketOrder.rate);

        if (marketOrder.amount == 0) {
            delete orders[orderId];
        }

        return true;
    }

    /**
     * @dev Triggered to get matching market order.
     * @param side Market order side it can be borrow or lend
     * @param amount Amount of funds taker wish to borrow/lend
     * @param rate Amount of interest rate taker wish to borrow/lend
     *
     * Returns zero if didn't find a matched order, reverts if no orders for specified interest rate
     */
    function matchOrders(
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    ) external view override returns (uint256) {
        if (side == ProtocolTypes.Side.LEND) {
            require(borrowOrders.exists(rate), "No orders exists for selected interest rate");
            return borrowOrders.findOrderIdForAmount(rate, amount);
        } else {
            require(lendOrders.exists(rate), "No orders exists for selected interest rate");
            return lendOrders.findOrderIdForAmount(rate, amount);
        }
    }

    /**
     * @dev Triggered to execute market order, if order matched it takes order, if not matched places new order.
     * @param side Market order side it can be borrow or lend
     * @param amount Amount of funds maker/taker wish to borrow/lend
     * @param rate Amount of interest rate maker/taker wish to borrow/lend
     *
     * Returns true after successful execution
     */
    function order(
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 rate
    ) external override nonReentrant returns (bool) {
        uint256 orderId;

        if (side == ProtocolTypes.Side.LEND) {
            orderId = borrowOrders.findOrderIdForAmount(rate, amount);
            if (orderId != 0) return takeOrder(ProtocolTypes.Side.BORROW, orderId, amount);
        } else {
            orderId = lendOrders.findOrderIdForAmount(rate, amount);
            if (orderId != 0) return takeOrder(ProtocolTypes.Side.LEND, orderId, amount);
        }

        makeOrder(side, amount, rate);
        return true;
    }

    /**
     * @dev Triggered to pause lending market.
     */
    function pauseMarket() public override onlyAcceptedContracts {
        _pause();
    }

    /**
     * @dev Triggered to pause lending market.
     */
    function unpauseMarket() public override onlyAcceptedContracts {
        _unpause();
    }

    /**
     * @dev Additional checks before making/taking orders.
     */
    function _beforeMarketOrder() internal view {
        require(!paused(), "Market paused");
    }
}
