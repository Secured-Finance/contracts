// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import './interfaces/ICollateral.sol';

/**
 * @dev Order Book contract module which allows lending market participants
 * to create/take/cancel market orders.
 *
 * This module is used for LendingMarket contract. It will store market orders
 * in unstructured way.
 */
contract OrderBook is ReentrancyGuard, Ownable {
    using SafeMath for uint256;

    // Contracts interfaces
    ICollateral collateral;

    /**
    * @dev Emitted when market order created by market maker.
    */
    event MakeOrder(uint256 id, address indexed maker, Side side, Ccy ccy, Term term, uint amount, uint rate, uint deadline);
    
    /**
    * @dev Emitted when market order canceled by market maker.
    *
    * Requirements:
    *
    * - Market order must be active and cancelable.
    */
    event CancelOrder(uint256 id, address indexed maker, Side side, uint256 amount, uint256 rate);

    /**
    * @dev Emitted when market order taken by market taker.
    *
    * Requirements:
    *
    * - Market order must be active.
    */
    event TakeOrder(uint256 id, address indexed taker, Side side, uint256 amount, uint256 rate);

    enum Side {
        LEND,
        BORROW
    }
    enum Ccy {ETH, FIL, USDC}
    enum Term {_3m, _6m, _1y, _2y, _3y, _5y}

    uint256 public last_order_id;
    Ccy public MarketCcy;
    Term public MarketTerm;
    uint256 internal constant BP = 10000; // basis point
    uint256 internal constant PCT = 100; // percentage base
    uint256 internal constant MKTMAKELEVEL = 20; // 20% for market making

    struct MarketOrder {
        Side side;
        uint256 amount;
        uint256 rate; // in basis points
        uint256 deadline;
        address maker;
    }

    /**
    * @dev Order Book mapping for all Market Orders.
    */
    mapping (uint256 => MarketOrder) public orders;

    /**
    * @dev Constructor.
    * @param _ccy The main currency for order book lending deals
    * @param _term The main term for order book lending deals
    */
    constructor(Ccy _ccy, Term _term) public {
        MarketCcy = _ccy;
        MarketTerm = _term;
    }

    /**
    * @dev Modifier to make a function callable only when the market order is active.
    * @param id Market order id
    */
    modifier activeOrder(uint256 id) {
        require(isActive(id), "Order Expired");
        _;
    }

    /**
    * @dev Modifier to make a function callable only when the market order can be canceled by market maker.
    * @param id Market order id
    */
    modifier cancelable(uint256 id) {
        require(isActive(id));
        require(getMaker(id) == msg.sender, "No access to cancel order");
        _;
    }

    /**
    * @dev Triggers to make a set collateral contract address.
    * @param colAddr Collateral contract addreess
    *
    * Requirements:
    *
    * - Can be executed only by contract owner.
    */
    function setCollateral(address colAddr) public onlyOwner {
        collateral = ICollateral(colAddr);
    }

    /**
    * @dev Triggers to make a check if market order executable.
    * If market order exceeded the deadline, market order deleted from order book.
    * @param id Market order id
    */
    function isActive(uint256 id) public view returns (bool active) {
        return orders[id].deadline > block.timestamp;
    }

    /**
    * @dev Triggers to get order maker address.
    * @param id Market order id
    */
    function getMaker(uint256 id) public view returns (address maker) {
        return orders[id].maker;
    }

    /**
    * @dev Triggers to get market order information.
    * @param id Market order id
    */
    function getOrder(uint256 id) public view returns (MarketOrder memory) {
      return orders[id];
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
    * @param id Market order id
    *
    * Requirements:
    * - Order has to be cancelable by market maker
    */
    function cancelOrder(uint256 id) public cancelable(id) nonReentrant returns (bool success) {
        MarketOrder memory order = orders[id];
        delete orders[id];

        // collateral.releaseCollateral(uint8(MarketCcy), order.amount.mul(MKTMAKELEVEL).div(PCT), order.maker);
        emit CancelOrder(
            id,
            order.maker,
            order.side,
            order.amount,
            order.rate
        );

        success = true;
    }

    /**
    * @dev Triggered to make new market order.
    * @param _side Borrow or Lend order position
    * @param _amount Amount of funds maker wish to borrow/lend
    * @param _rate Preferable interest rate
    * @param _deadline Deadline for market maker execution (adds to current network timestamp)
    */
    function makeOrder(Side _side, uint256 _amount, uint256 _rate, uint256 _deadline) public nonReentrant returns (uint id) {
        MarketOrder memory order;

        require(_amount > 0, "Can't place empty amount");
        require(_rate > 0, "Can't place empty rate");

        order.side = _side;
        order.amount = _amount;
        order.rate = _rate;
        order.maker = msg.sender;
        order.deadline = block.timestamp.add(_deadline);
        id = _next_id();

        orders[id] = order;
        // collateral.useCollateral(uint8(MarketCcy), _amount.mul(MKTMAKELEVEL).div(PCT), msg.sender);
        emit MakeOrder(
            id, 
            order.maker, 
            order.side, 
            MarketCcy, 
            MarketTerm, 
            order.amount, 
            order.rate, 
            order.deadline    
        );
    }

    /**
    * @dev Triggered to take market order.
    * @param id Market Order id in Order Book
    * @param _amount Amount of funds taker wish to borrow/lend
    *
    * Requirements:
    * - Market order has to be active
    */
    function takeOrder(uint256 id, uint256 _amount) public activeOrder(id) nonReentrant returns (bool) {
        MarketOrder memory order = orders[id];
        require(_amount <= order.amount, "Insuficient amount");

        orders[id].amount = order.amount.sub(_amount);

        Side takerSide;
        if (order.side == Side.LEND) {
            takerSide = Side.BORROW;
        } else {
            takerSide = Side.LEND;
        }

        emit TakeOrder(
            id,
            msg.sender,
            takerSide,
            _amount,
            order.rate
        );

        if (order.amount == 0) {
          delete orders[id];
        }

        return true;
    }
}