// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// interfaces
import {ILendingMarketV2} from "./interfaces/ILendingMarketV2.sol";
import {IGenesisValueToken} from "./interfaces/IGenesisValueToken.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {FutureValueHandler} from "./libraries/FutureValueHandler.sol";
import {HitchensOrderStatisticsTreeLib} from "./libraries/HitchensOrderStatisticsTreeLib.sol";
import {ProductPrefixes} from "./libraries/ProductPrefixes.sol";
// mixins
import {MixinAddressResolverV2} from "./mixins/MixinAddressResolverV2.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketV2Storage as Storage, MarketOrder} from "./storages/LendingMarketV2Storage.sol";

/**
 * @dev Lending Market contract module which allows lending market participants
 * to create/take/cancel market orders.
 *
 * It will store market orders in structured red-black tree and doubly linked list in each node.
 */
contract LendingMarketV2 is
    ILendingMarketV2,
    MixinAddressResolverV2,
    ReentrancyGuard,
    Pausable,
    Proxyable
{
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    /**
     * @dev Modifier to make a function callable only by order maker.
     * @param _orderId Market order id
     */
    modifier onlyMaker(uint256 _orderId) {
        require(msg.sender == getMaker(_orderId), "caller is not the maker");
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
        uint256 _marketNo,
        uint256 _maturity,
        uint256 _basisDate,
        address _gvToken
    ) public initializer onlyBeacon {
        registerAddressResolver(_resolver);

        Storage.slot().ccy = _ccy;
        Storage.slot().marketNo = _marketNo;
        Storage.slot().maturity = _maturity;
        Storage.slot().basisDate = _basisDate;
        Storage.slot().gvToken = IGenesisValueToken(_gvToken);
        FutureValueHandler.updateMaturity(_maturity);

        buildCache();
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.LENDING_MARKET_CONTROLLER;
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
    function getMarket() public view override returns (Market memory) {
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
    function getOrder(uint256 _orderId) public view override returns (MarketOrder memory) {
        return Storage.slot().orders[_orderId];
    }

    function getOrderFromTree(uint256 _maturity, uint256 _orderId)
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
        MarketOrder memory marketOrder = Storage.slot().orders[_orderId];

        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            return Storage.slot().lendOrders[_maturity].getOrderById(marketOrder.rate, _orderId);
        } else {
            return Storage.slot().borrowOrders[_maturity].getOrderById(marketOrder.rate, _orderId);
        }
    }

    function futureValueOf(address account) public view override returns (int256) {
        (int256 futureValue, uint256 maturity) = FutureValueHandler.getBalanceInMaturity(account);

        if (maturity == 0) {
            return 0;
        } else if (Storage.slot().maturity != maturity) {
            futureValue = Storage.slot().gvToken.futureValueOf(maturity, futureValue);
        }

        return futureValue;
    }

    function presentValueOf(address account) external view override returns (int256) {
        int256 futureValue = futureValueOf(account);

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
        public
        override
        ifMatured
        onlyAcceptedContracts
        returns (uint256 prevMaturity)
    {
        prevMaturity = Storage.slot().maturity;
        FutureValueHandler.updateMaturity(_maturity);
        Storage.slot().maturity = _maturity;

        emit OpenMarket(_maturity, prevMaturity);
    }

    /**
     * @dev Cancels the market order.
     * @param _orderId Market order id
     *
     * Requirements:
     * - Order has to be cancelable by market maker
     */
    function cancelOrder(uint256 _orderId)
        public
        override
        onlyMaker(_orderId)
        whenNotPaused
        returns (bool success)
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

        collateralAggregator().releaseUnsettledCollateral(
            marketOrder.maker,
            Storage.slot().ccy,
            (marketOrder.amount * ProtocolTypes.MKTMAKELEVEL) / ProtocolTypes.PCT
        );
        emit CancelOrder(
            _orderId,
            marketOrder.maker,
            marketOrder.side,
            marketOrder.amount,
            marketOrder.rate
        );

        success = true;
    }

    /**
     * @dev Makes new market order.
     * @param _side Borrow or Lend order position
     * @param _amount Amount of funds maker wish to borrow/lend
     * @param _rate Preferable interest rate
     */
    function makeOrder(
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) internal whenNotPaused returns (uint256 orderId) {
        MarketOrder memory marketOrder;

        require(_amount > 0, "Can't place empty amount");
        require(_rate > 0, "Can't place empty rate");

        marketOrder.side = _side;
        marketOrder.amount = _amount;
        marketOrder.rate = _rate;
        marketOrder.maker = msg.sender;
        marketOrder.maturity = Storage.slot().maturity;
        orderId = nextOrderId();

        Storage.slot().orders[orderId] = marketOrder;
        collateralAggregator().useUnsettledCollateral(
            msg.sender,
            Storage.slot().ccy,
            (_amount * ProtocolTypes.MKTMAKELEVEL) / ProtocolTypes.PCT
        );
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
    ) internal whenNotPaused returns (bool) {
        MarketOrder memory marketOrder = Storage.slot().orders[orderId];
        require(_amount <= marketOrder.amount, "Insufficient amount");
        require(marketOrder.maker != msg.sender, "Maker couldn't take its order");

        address lender;
        address borrower;
        Storage.slot().orders[orderId].amount = marketOrder.amount - _amount;

        if (marketOrder.side == ProtocolTypes.Side.LEND) {
            require(
                Storage.slot().lendOrders[Storage.slot().maturity].fillOrder(
                    marketOrder.rate,
                    orderId,
                    _amount
                ),
                "Couldn't fill order"
            );
            lender = marketOrder.maker;
            borrower = msg.sender;
        } else if (marketOrder.side == ProtocolTypes.Side.BORROW) {
            require(
                Storage.slot().borrowOrders[Storage.slot().maturity].fillOrder(
                    marketOrder.rate,
                    orderId,
                    _amount
                ),
                "Couldn't fill order"
            );
            lender = msg.sender;
            borrower = marketOrder.maker;
        }

        mintGenesisValueToken(lender);
        mintGenesisValueToken(borrower);

        // NOTE: The formula is: featureValue = amount * (1 + rate * (maturity - now) / 360 days).
        uint256 currentRate = (marketOrder.rate * (Storage.slot().maturity - block.timestamp)) /
            ProtocolTypes.SECONDS_IN_YEAR;
        uint256 fvAmount = (_amount * (ProtocolTypes.BP + currentRate)) / ProtocolTypes.BP;

        FutureValueHandler.add(lender, borrower, fvAmount);

        collateralAggregator().releaseUnsettledCollateral(
            lender,
            Storage.slot().ccy,
            (_amount * ProtocolTypes.MKTMAKELEVEL) / ProtocolTypes.PCT
        );

        emit TakeOrder(orderId, msg.sender, side, _amount, marketOrder.rate);

        if (marketOrder.amount == 0) {
            delete Storage.slot().orders[orderId];
        }

        return true;
    }

    /**
     * @dev Gets the matching market order.
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
    ) external view override ifNotClosed returns (uint256) {
        if (side == ProtocolTypes.Side.LEND) {
            require(
                Storage.slot().borrowOrders[Storage.slot().maturity].exists(rate),
                "No orders exists for selected interest rate"
            );
            return
                Storage.slot().borrowOrders[Storage.slot().maturity].findOrderIdForAmount(
                    rate,
                    amount
                );
        } else {
            require(
                Storage.slot().lendOrders[Storage.slot().maturity].exists(rate),
                "No orders exists for selected interest rate"
            );
            return
                Storage.slot().lendOrders[Storage.slot().maturity].findOrderIdForAmount(
                    rate,
                    amount
                );
        }
    }

    /**
     * @dev Executes the market order, if order matched it takes order, if not matched places new order.
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
    ) external override nonReentrant ifNotClosed returns (bool) {
        uint256 orderId;

        if (side == ProtocolTypes.Side.LEND) {
            orderId = Storage.slot().borrowOrders[Storage.slot().maturity].findOrderIdForAmount(
                rate,
                amount
            );
            if (orderId != 0) return takeOrder(ProtocolTypes.Side.BORROW, orderId, amount);
        } else {
            orderId = Storage.slot().lendOrders[Storage.slot().maturity].findOrderIdForAmount(
                rate,
                amount
            );
            if (orderId != 0) return takeOrder(ProtocolTypes.Side.LEND, orderId, amount);
        }

        makeOrder(side, amount, rate);
        return true;
    }

    /**
     * @dev Pauses the lending market.
     */
    function pauseMarket() public override onlyAcceptedContracts {
        _pause();
    }

    /**
     * @dev Pauses the lending market.
     */
    function unpauseMarket() public override onlyAcceptedContracts {
        _unpause();
    }

    /**
     * @dev Convert FutureValue to GenesisValue if there is balance in the past maturity.
     * @param account Target address to mint token
     */
    function mintGenesisValueToken(address account) private {
        if (FutureValueHandler.hasPastMaturityBalance(account)) {
            uint256 basisMaturity = FutureValueHandler.getMaturity(account);
            int256 removedFutureValue = FutureValueHandler.remove(account);
            Storage.slot().gvToken.mint(account, basisMaturity, removedFutureValue);
        }
    }
}
