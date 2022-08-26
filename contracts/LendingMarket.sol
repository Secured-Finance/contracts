// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
// interfaces
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {HitchensOrderStatisticsTreeLib} from "./libraries/HitchensOrderStatisticsTreeLib.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinFutureValue} from "./mixins/MixinFutureValue.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketStorage as Storage, MarketOrder} from "./storages/LendingMarketStorage.sol";

/**
 * @dev LendingMarket contract is the module that allows lending market participants
 * to create/cancel market orders.
 *
 * It will store market orders in structured red-black tree and doubly linked list in each node.
 */
contract LendingMarket is
    ILendingMarket,
    MixinAddressResolver,
    MixinFutureValue,
    Pausable,
    Proxyable
{
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    /**
     * @dev Modifier to make a function callable only by order maker.
     * @param _orderId Market order id
     */
    modifier onlyMaker(address account, uint256 _orderId) {
        require(account == getMaker(_orderId), "caller is not the maker");
        _;
    }

    /**
     * @dev Modifier to check if the market is not closed.
     */
    modifier ifNotClosed() {
        require(
            !isMatured() && block.timestamp >= Storage.slot().basisDate,
            "Market is not opened"
        );
        _;
    }

    /**
     * @dev Modifier to check if the market is matured.
     */
    modifier ifMatured() {
        require(isMatured(), "Market is not matured");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     * @param _resolver The address of the Address Resolver contract
     * @param _ccy The main currency for order book lending deals
     * @param _maturity The initial maturity of the market
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

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.LENDING_MARKET_CONTROLLER;
    }

    /**
     * @dev Gets the order maker address.
     * @param _orderId Market order id
     */
    function getMaker(uint256 _orderId) public view override returns (address maker) {
        return Storage.slot().orders[_orderId].maker;
    }

    /**
     * @dev Gets the market data.
     */
    function getMarket() external view override returns (Market memory) {
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
     * @dev Gets the highest borrow rate.
     */
    function getBorrowRate() public view override returns (uint256 rate) {
        uint256 maturity = Storage.slot().maturity;
        return Storage.slot().borrowOrders[maturity].last();
    }

    /**
     * @dev Gets the highest lend rate.
     */
    function getLendRate() public view override returns (uint256 rate) {
        return Storage.slot().lendOrders[Storage.slot().maturity].last();
    }

    /**
     * @dev Gets mid rate.
     */
    function getMidRate() public view override returns (uint256 rate) {
        uint256 borrowRate = getBorrowRate();
        uint256 lendRate = getLendRate();
        uint256 combinedRate = borrowRate + lendRate;

        return combinedRate / 2;
    }

    /**
     * @dev Gets the market maturity.
     */
    function getMaturity() public view override returns (uint256) {
        return Storage.slot().maturity;
    }

    /**
     * @dev Gets the market currency.
     */
    function getCurrency() public view override returns (bytes32) {
        return Storage.slot().ccy;
    }

    /**
     * @dev Gets if the market is matured.
     */
    function isMatured() public view returns (bool) {
        return block.timestamp >= Storage.slot().maturity;
    }

    /**
     * @dev Gets the market order information.
     * @param _orderId Market order id
     */
    function getOrder(uint256 _orderId) external view override returns (MarketOrder memory) {
        return Storage.slot().orders[_orderId];
    }

    function getOrderFromTree(uint256 _maturity, uint256 _orderId)
        external
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
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];

        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            return Storage.slot().lendOrders[_maturity].getOrderById(marketOrder.rate, _orderId);
        } else {
            return Storage.slot().borrowOrders[_maturity].getOrderById(marketOrder.rate, _orderId);
        }
    }

    /**
     * @dev Gets the future value in the latest maturity the user has.
     * If the market is rotated, the future value maturity is addressed as the old one
     * and return 0 here.
     * @param _user User address
     */
    function futureValueOf(address _user) public view override returns (int256) {
        (int256 futureValue, uint256 maturity) = getFutureValue(_user);

        if (Storage.slot().maturity == maturity) {
            return futureValue;
        } else {
            return 0;
        }
    }

    /**
     * @dev Gets the future value calculated from the future value & market rate.
     * @param _user User address
     */
    function presentValueOf(address _user) external view override returns (int256) {
        int256 futureValue = futureValueOf(_user);

        // NOTE: The formula is: presentValue = futureValue / (1 + rate * (maturity - now) / 360 days).
        uint256 rate = getMidRate();
        uint256 dt = Storage.slot().maturity >= block.timestamp
            ? Storage.slot().maturity - block.timestamp
            : 0;

        return ((futureValue * int256(ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR)) /
            int256(ProtocolTypes.BP * ProtocolTypes.SECONDS_IN_YEAR + rate * dt));
    }

    /**
     * @dev Internally triggered to increase and return id of last order in order book.
     */
    function nextOrderId() internal returns (uint256) {
        Storage.slot().lastOrderId++;
        return Storage.slot().lastOrderId;
    }

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
     * @dev Cancels the market order.
     * @param _user User address
     * @param _orderId Market order id
     *
     * Requirements:
     * - Order has to be cancelable by market maker
     */
    function cancelOrder(address _user, uint256 _orderId)
        public
        override
        onlyMaker(_user, _orderId)
        whenNotPaused
        returns (uint256)
    {
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];
        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            Storage.slot().lendOrders[Storage.slot().maturity].remove(
                marketOrder.amount,
                marketOrder.rate,
                _orderId
            );
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            Storage.slot().borrowOrders[Storage.slot().maturity].remove(
                marketOrder.amount,
                marketOrder.rate,
                _orderId
            );
        }
        delete Storage.slot().orders[_orderId];

        emit CancelOrder(
            _orderId,
            marketOrder.maker,
            marketOrder.side,
            marketOrder.amount,
            marketOrder.rate
        );

        return marketOrder.amount;
    }

    /**
     * @dev Makes new market order.
     * @param _side Borrow or Lend order position
     * @param _user Target address
     * @param _amount Amount of funds maker wish to borrow/lend
     * @param _rate Preferable interest rate
     */
    function makeOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _rate
    ) internal returns (uint256 orderId) {
        MarketOrder memory marketOrder;

        marketOrder.side = _side;
        marketOrder.amount = _amount;
        marketOrder.rate = _rate;
        marketOrder.maker = _user;
        marketOrder.maturity = Storage.slot().maturity;
        orderId = nextOrderId();

        Storage.slot().orders[orderId] = marketOrder;

        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            Storage.slot().lendOrders[Storage.slot().maturity].insert(
                marketOrder.amount,
                marketOrder.rate,
                orderId
            );
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            Storage.slot().borrowOrders[Storage.slot().maturity].insert(
                marketOrder.amount,
                marketOrder.rate,
                orderId
            );
        }

        emit MakeOrder(
            orderId,
            marketOrder.maker,
            marketOrder.side,
            Storage.slot().ccy,
            marketOrder.maturity,
            marketOrder.amount,
            marketOrder.rate
        );
    }

    /**
     * @dev Takes the market order.
     * @param _user User address
     * @param _orderId Market order id in the order book
     * @param _amount Amount of funds taker wish to borrow/lend
     *
     * Requirements:
     * - Market order has to be active
     */
    function takeOrder(
        ProtocolTypes.Side side,
        address _user,
        uint256 _orderId,
        uint256 _amount
    ) internal returns (address) {
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];
        require(_amount <= marketOrder.amount, "Insufficient amount");
        require(marketOrder.maker != _user, "Maker couldn't take its order");

        address lender;
        address borrower;
        Storage.slot().orders[_orderId].amount = marketOrder.amount - _amount;

        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            require(
                Storage.slot().lendOrders[Storage.slot().maturity].fillOrder(
                    marketOrder.rate,
                    _orderId,
                    _amount
                ),
                "Couldn't fill order"
            );
            lender = marketOrder.maker;
            borrower = _user;
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            require(
                Storage.slot().borrowOrders[Storage.slot().maturity].fillOrder(
                    marketOrder.rate,
                    _orderId,
                    _amount
                ),
                "Couldn't fill order"
            );
            lender = _user;
            borrower = marketOrder.maker;
        }

        // NOTE: The formula is: futureValue = amount * (1 + rate * (maturity - now) / 360 days).
        uint256 currentRate = (marketOrder.rate * (Storage.slot().maturity - block.timestamp)) /
            ProtocolTypes.SECONDS_IN_YEAR;
        uint256 fvAmount = (_amount * (ProtocolTypes.BP + currentRate)) / ProtocolTypes.BP;

        _addFutureValue(lender, borrower, fvAmount, Storage.slot().maturity);

        emit TakeOrder(_orderId, _user, side, _amount, marketOrder.rate);

        if (marketOrder.amount == 0) {
            delete Storage.slot().orders[_orderId];
        }

        return marketOrder.maker;
    }

    /**
     * @dev Gets the matching market order.
     * @param _side Market order side it can be borrow or lend
     * @param _amount Amount of funds taker wish to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     *
     * Returns zero if didn't find a matched order, reverts if no orders for specified interest rate
     */
    function matchOrders(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external view override ifNotClosed returns (uint256) {
        if (_side == ProtocolTypes.Side.LEND) {
            require(
                Storage.slot().borrowOrders[Storage.slot().maturity].exists(_rate),
                "No orders exists for selected interest rate"
            );
            return
                Storage.slot().borrowOrders[Storage.slot().maturity].findOrderIdForAmount(
                    _rate,
                    _amount
                );
        } else {
            require(
                Storage.slot().lendOrders[Storage.slot().maturity].exists(_rate),
                "No orders exists for selected interest rate"
            );
            return
                Storage.slot().lendOrders[Storage.slot().maturity].findOrderIdForAmount(
                    _rate,
                    _amount
                );
        }
    }

    /**
     * @dev Executes the market order, if order matched it takes order, if not matched places new order.
     * @param _side Market order side it can be borrow or lend
     * @param _user User address
     * @param _amount Amount of funds maker/taker wish to borrow/lend
     * @param _rate Amount of interest rate maker/taker wish to borrow/lend
     *
     * Returns true after successful execution
     */
    function createOrder(
        ProtocolTypes.Side _side,
        address _user,
        uint256 _amount,
        uint256 _rate
    ) external override whenNotPaused onlyAcceptedContracts ifNotClosed returns (address, uint256) {
        require(_amount > 0, "Can't place empty amount");
        require(_rate > 0, "Can't place empty rate");
        uint256 orderId;

        if (_side == ProtocolTypes.Side.LEND) {
            orderId = Storage.slot().borrowOrders[Storage.slot().maturity].findOrderIdForAmount(
                _rate,
                _amount
            );
        } else {
            orderId = Storage.slot().lendOrders[Storage.slot().maturity].findOrderIdForAmount(
                _rate,
                _amount
            );
        }

        if (orderId == 0) {
            makeOrder(_side, _user, _amount, _rate);
            return (_user, 0);
        } else {
            address maker = takeOrder(_side, _user, orderId, _amount);
            return (maker, _amount);
        }
    }

    /**
     * @dev Pauses the lending market.
     */
    function pauseMarket() external override onlyAcceptedContracts {
        _pause();
    }

    /**
     * @dev Pauses the lending market.
     */
    function unpauseMarket() external override onlyAcceptedContracts {
        _unpause();
    }

    /**
     * @dev Remove future value if there is balance in the past maturity.
     * @param _user Target address to mint token
     */
    function removeFutureValueInPastMaturity(address _user)
        external
        onlyAcceptedContracts
        returns (int256 removedAmount, uint256 basisMaturity)
    {
        if (hasFutureValueInPastMaturity(_user, Storage.slot().maturity)) {
            (removedAmount, basisMaturity) = _removeFutureValue(_user);
        }
    }
}
