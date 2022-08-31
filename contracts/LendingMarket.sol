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
 * @notice Implements the module that allows lending market participants to create/cancel market orders,
 * and provides the calculation module of future value by inheriting `MixinFutureValue.sol`.
 *
 * For updating, this contract is basically called from the `LendingMarketController.sol`,
 * not called directly from users.
 *
 * @dev The market orders is stored in structured red-black trees and doubly linked lists in each node.
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
     * @notice Modifier to make a function callable only by order maker.
     * @param _orderId Market order id
     */
    modifier onlyMaker(address account, uint256 _orderId) {
        require(account == getMaker(_orderId), "caller is not the maker");
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
     * @notice Gets the order maker address.
     * @param _orderId The market order id
     * @return maker The order maker address
     */
    function getMaker(uint256 _orderId) public view override returns (address maker) {
        return Storage.slot().orders[_orderId].maker;
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
     * @notice Gets the highest lend rate.
     * @return rate The highest lend rate
     */
    function getLendRate() public view override returns (uint256 rate) {
        return Storage.slot().lendOrders[Storage.slot().maturity].last();
    }

    /**
     * @notice Gets mid rate.
     * @return rate The mid rate
     */
    function getMidRate() public view override returns (uint256 rate) {
        uint256 borrowRate = getBorrowRate();
        uint256 lendRate = getLendRate();
        uint256 combinedRate = borrowRate + lendRate;

        return combinedRate / 2;
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
     * @notice Gets the market order information.
     * @param _orderId The market order id
     * @return order The market order information
     */
    function getOrder(uint256 _orderId) external view override returns (MarketOrder memory order) {
        return Storage.slot().orders[_orderId];
    }

    /**
     * @notice Gets the market order from the order book in the maturity.
     * @param _maturity The maturity of the order book
     * @param _orderId The market order id
     * @return order The market order information
     */
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
     * @notice Gets the future value in the latest maturity the user has.
     *
     * If the market is rotated, the maturity in the market is updated, so the existing future value
     * is addressed as an old future value in old maturity.
     * This method doesn't return those old future values.
     *
     * @param _user User address
     * @return The future value in latest maturity
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
     * @notice Gets the present value calculated from the future value & market rate.
     * @param _user User address
     * @return The present value
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
     * @notice Increases and returns id of last order in order book.
     * @return The new order id
     */
    function nextOrderId() internal returns (uint256) {
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
     * @notice Makes new market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
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
     * @notice Takes the market order.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _orderId Market order id in the order book
     * @param _amount Amount of funds the maker wants to borrow/lend
     */
    function takeOrder(
        ProtocolTypes.Side _side,
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

        emit TakeOrder(_orderId, _user, _side, _amount, marketOrder.rate);

        if (marketOrder.amount == 0) {
            delete Storage.slot().orders[_orderId];
        }

        return marketOrder.maker;
    }

    /**
     * @notice Gets if the market order will be matched or not.
     *
     * Returns zero if there is not a matched order.
     * Reverts if no orders for specified interest rate.
     *
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     */
    function matchOrders(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external view override ifOpened returns (uint256) {
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
     * @notice Creates the order. Takes the order if the order is matched,
     * and places new order if not match it.
     * @param _side Order position type, Borrow or Lend
     * @param _user User's address
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return maker The maker address
     * @return amount The taken amount
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
        returns (address maker, uint256 amount)
    {
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
            maker = _user;
            amount = 0;
        } else {
            maker = takeOrder(_side, _user, orderId, _amount);
            amount = _amount;
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
     * @notice Remove the all future value if there is balance in the past maturity.
     * @param _user User's address
     * @return removedAmount Removed future value amount
     * @return maturity Maturity of future value
     */
    function removeFutureValueInPastMaturity(address _user)
        external
        onlyAcceptedContracts
        returns (int256 removedAmount, uint256 maturity)
    {
        if (hasFutureValueInPastMaturity(_user, Storage.slot().maturity)) {
            (removedAmount, maturity) = _removeFutureValue(_user);
        }
    }
}
