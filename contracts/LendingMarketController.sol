// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarketController} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "./interfaces/IFutureValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "./libraries/BokkyPooBahsDateTimeLibrary.sol";
import {FundCalculationLogic} from "./libraries/logics/FundCalculationLogic.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "./storages/LendingMarketControllerStorage.sol";

/**
 * @notice Implements the module to manage separated lending order-book markets per maturity.
 *
 * This contract also works as a factory contract that can deploy (start) a new lending market
 * for selected currency and maturity and has the calculation logic for the Genesis value in addition.
 *
 * Deployed Lending Markets are rotated and reused as it reaches the maturity date. At the time of rotation,
 * a new maturity date is set and the compound factor is updated.
 *
 * The users mainly call this contract to create orders to lend or borrow funds.
 */
contract LendingMarketController is
    ILendingMarketController,
    MixinAddressResolver,
    ReentrancyGuard,
    Ownable,
    Proxyable
{
    using EnumerableSet for EnumerableSet.Bytes32Set;
    uint256 private constant BASIS_TERM = 3;
    uint256 private constant MAXIMUM_ORDER_COUNT = 20;

    /**
     * @notice Modifier to check if the currency has a lending market.
     * @param _ccy Currency name in bytes32
     */
    modifier hasLendingMarket(bytes32 _ccy) {
        require(
            Storage.slot().lendingMarkets[_ccy].length > 0,
            "No lending markets exist for a specific currency"
        );
        _;
    }

    /**
     * @notice Modifier to check if there is a market in the maturity.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     */
    modifier ifValidMaturity(bytes32 _ccy, uint256 _maturity) {
        require(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity] != address(0),
            "Invalid maturity"
        );
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     */
    function initialize(address _owner, address _resolver) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](4);
        contracts[0] = Contracts.BEACON_PROXY_CONTROLLER;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.GENESIS_VALUE_VAULT;
        contracts[3] = Contracts.TOKEN_VAULT;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.TOKEN_VAULT;
    }

    /**
     * @notice Gets the genesis date when the first market opens for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return The genesis date
     */
    function getGenesisDate(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().genesisDates[_ccy];
    }

    /**
     * @notice Gets the lending market contract addresses for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending market address
     */
    function getLendingMarkets(bytes32 _ccy) external view override returns (address[] memory) {
        return Storage.slot().lendingMarkets[_ccy];
    }

    /**
     * @notice Gets the lending market contract address for the selected currency and maturity.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     * @return The lending market address
     */
    function getLendingMarket(bytes32 _ccy, uint256 _maturity)
        external
        view
        override
        returns (address)
    {
        return Storage.slot().maturityLendingMarkets[_ccy][_maturity];
    }

    /**
     * @notice Gets the feture value contract address for the selected currency and maturity.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     * @return The lending market address
     */
    function getFutureValueVault(bytes32 _ccy, uint256 _maturity)
        public
        view
        override
        returns (address)
    {
        return
            Storage.slot().futureValueVaults[_ccy][
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ];
    }

    /**
     * @notice Gets borrow prices per future value for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the borrowing prices per future value of the lending market
     */
    function getBorrowUnitPrices(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory unitPrices = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            unitPrices[i] = market.getBorrowUnitPrice();
        }

        return unitPrices;
    }

    /**
     * @notice Gets lend prices per future value for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending prices per future value of the lending market
     */
    function getLendUnitPrices(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory unitPrices = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            unitPrices[i] = market.getLendUnitPrice();
        }

        return unitPrices;
    }

    /**
     * @notice Gets mid prices per future value for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the mid prices per future value of the lending market
     */
    function getMidUnitPrices(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory unitPrices = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            unitPrices[i] = market.getMidUnitPrice();
        }

        return unitPrices;
    }

    /**
     * @notice Gets the order book of borrow.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
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
        override
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        return ILendingMarket(market).getBorrowOrderBook(_limit);
    }

    /**
     * @notice Gets the order book of lend.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
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
        override
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        return ILendingMarket(market).getLendOrderBook(_limit);
    }

    /**
     * @notice Gets maturities for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending market maturity
     */
    function getMaturities(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory maturities = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            maturities[i] = market.getMaturity();
        }

        return maturities;
    }

    /**
     * @notice Get all the currencies in which the user has lending positions or orders.
     * @param _user User's address
     * @return The array of the currency
     */
    function getUsedCurrencies(address _user) external view override returns (bytes32[] memory) {
        return Storage.slot().usedCurrencies[_user].values();
    }

    /**
     * @notice Gets the future value of the account for selected currency and maturity.
     * @param _ccy Currency name in bytes32 for Lending Market
     * @param _maturity The maturity of the market
     * @param _user User's address
     * @return futureValue The future value
     */
    function getFutureValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external view override returns (int256 futureValue) {
        return FundCalculationLogic.calculateActualFutureValue(_ccy, _maturity, _user);
    }

    /**
     * @notice Gets the present value of the account for selected currency and maturity.
     * @param _ccy Currency name in bytes32 for Lending Market
     * @param _maturity The maturity of the market
     * @param _user User's address
     * @return presentValue The present value
     */
    function getPresentValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external view override returns (int256 presentValue) {
        return FundCalculationLogic.calculateActualPresentValue(_ccy, _maturity, _user);
    }

    /**
     * @notice Gets the total present value of the account for selected currency.
     * @param _ccy Currency name in bytes32 for Lending Market
     * @param _user User's address
     * @return totalPresentValue The total present value
     */
    function getTotalPresentValue(bytes32 _ccy, address _user)
        external
        view
        override
        returns (int256 totalPresentValue)
    {
        return FundCalculationLogic.calculateActualPresentValue(_ccy, _user);
    }

    /**
     * @notice Gets the total present value of the account converted to ETH.
     * @param _user User's address
     * @return totalPresentValue The total present value in ETH
     */
    function getTotalPresentValueInETH(address _user)
        external
        view
        override
        returns (int256 totalPresentValue)
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            int256 amount = FundCalculationLogic.calculateActualPresentValue(ccy, _user);
            totalPresentValue += currencyController().convertToETH(ccy, amount);
        }
    }

    /**
     * @notice Gets the funds that are calculated from the user's lending order list for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return workingOrdersAmount The working orders amount on the order book
     * @return claimableAmount The claimable amount due to the lending orders being filled on the order book
     * @return lentAmount The lent amount due to the lend orders being filled on the order book
     */
    function calculateLentFundsFromOrders(bytes32 _ccy, address _user)
        external
        view
        override
        returns (
            uint256 workingOrdersAmount,
            uint256 claimableAmount,
            uint256 lentAmount
        )
    {
        return FundCalculationLogic.calculateLentFundsFromOrders(_ccy, _user);
    }

    /**
     * @notice Gets the funds that are calculated from the user's borrowing order list for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return workingOrdersAmount The working orders amount on the order book
     * @return debtAmount The debt amount due to the borrow orders being filled on the order book
     * @return borrowedAmount The borrowed amount due to the borrow orders being filled on the order book
     */
    function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _user)
        external
        view
        override
        returns (
            uint256 workingOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        return FundCalculationLogic.calculateBorrowedFundsFromOrders(_ccy, _user);
    }

    /**
     * @notice Gets the funds that are calculated from the user's lending and borrowing order list
     * for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return workingLendOrdersAmount The working orders amount on the lend order book
     * @return claimableAmount The claimable amount due to the lending orders being filled on the order book
     * @return collateralAmount The actual collateral amount that is calculated by netting using the haircut.
     * @return lentAmount The lent amount due to the lend orders being filled on the order book
     * @return workingBorrowOrdersAmount The working orders amount on the borrow order book
     * @return debtAmount The debt amount due to the borrow orders being filled on the order book
     * @return borrowedAmount The borrowed amount due to the borrow orders being filled on the order book
     */
    function calculateFunds(bytes32 _ccy, address _user)
        external
        view
        override
        returns (
            uint256 workingLendOrdersAmount,
            uint256 claimableAmount,
            uint256 collateralAmount,
            uint256 lentAmount,
            uint256 workingBorrowOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        if (Storage.slot().usedCurrencies[_user].contains(_ccy)) {
            return FundCalculationLogic.calculateFunds(_ccy, _user);
        }
    }

    /**
     * @notice Gets the funds that are calculated from the user's lending and borrowing order list
     * for all currencies in ETH.
     * @param _user User's address
     */
    function calculateTotalFundsInETH(
        address _user,
        bytes32 _depositCcy,
        uint256 _depositAmount
    )
        external
        view
        override
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount,
            bool isEnoughDeposit
        )
    {
        return FundCalculationLogic.calculateTotalFundsInETH(_user, _depositCcy, _depositAmount);
    }

    /**
     * @notice Gets if the lending market is initialized.
     * @param _ccy Currency name in bytes32
     * @return The boolean if the lending market is initialized or not
     */
    function isInitializedLendingMarket(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().genesisDates[_ccy] != 0;
    }

    /**
     * @notice Initialize the lending market to set a genesis date and compound factor
     * @param _ccy Currency name in bytes32
     * @param _genesisDate The genesis date when the initial market is opened
     * @param _compoundFactor The initial compound factor when the initial market is opened
     */
    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor
    ) external override onlyOwner {
        require(_compoundFactor > 0, "Invalid compound factor");
        require(!isInitializedLendingMarket(_ccy), "Already initialized");

        genesisValueVault().initialize(_ccy, 40, _compoundFactor);
        Storage.slot().genesisDates[_ccy] = _genesisDate;
    }

    /**
     * @notice Deploys new Lending Market and save address at lendingMarkets mapping.
     * @param _ccy Main currency for new lending market
     * @notice Reverts on deployment market with existing currency and term
     * @return market The proxy contract address of created lending market
     */
    function createLendingMarket(bytes32 _ccy)
        external
        override
        onlyOwner
        returns (address market, address futureValueVault)
    {
        require(
            genesisValueVault().isInitialized(_ccy),
            "Lending market hasn't been initialized in the currency"
        );
        require(currencyController().currencyExists(_ccy), "Non supported currency");

        uint256 genesisDate = Storage.slot().genesisDates[_ccy];

        if (Storage.slot().lendingMarkets[_ccy].length > 0) {
            genesisDate = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
        }

        uint256 nextMaturity = TimeLibrary.addMonths(genesisDate, BASIS_TERM);

        market = beaconProxyController().deployLendingMarket(
            _ccy,
            Storage.slot().genesisDates[_ccy],
            nextMaturity
        );
        futureValueVault = beaconProxyController().deployFutureValueVault();

        Storage.slot().lendingMarkets[_ccy].push(market);
        Storage.slot().maturityLendingMarkets[_ccy][nextMaturity] = market;
        Storage.slot().futureValueVaults[_ccy][market] = futureValueVault;

        emit CreateLendingMarket(
            _ccy,
            market,
            futureValueVault,
            Storage.slot().lendingMarkets[_ccy].length,
            nextMaturity
        );
    }

    /**
     * @notice Creates an order. Takes orders if the orders are matched,
     * and places new order if not match it.
     *
     * In addition, converts the future value to the genesis value if there is future value in past maturity
     * before the execution of order creation.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        _convertFutureValueToGenesisValue(_ccy, _maturity, msg.sender);
        _createOrder(_ccy, _maturity, msg.sender, _side, _amount, _unitPrice, false);
        return true;
    }

    /**
     * @notice Deposits funds and creates an order at the same time.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function depositAndCreateOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        tokenVault().depositFrom(msg.sender, _ccy, _amount);
        _convertFutureValueToGenesisValue(_ccy, _maturity, msg.sender);
        _createOrder(_ccy, _maturity, msg.sender, _side, _amount, _unitPrice, false);
        return true;
    }

    /**
     * @notice Deposits funds and creates a lend order with ETH at the same time.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function depositAndCreateLendOrderWithETH(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _unitPrice
    ) external payable override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        tokenVault().depositFrom{value: msg.value}(msg.sender, _ccy, msg.value);
        _convertFutureValueToGenesisValue(_ccy, _maturity, msg.sender);
        _createOrder(
            _ccy,
            _maturity,
            msg.sender,
            ProtocolTypes.Side.LEND,
            msg.value,
            _unitPrice,
            false
        );
        return true;
    }

    /**
     * @notice Cancels the own order.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _orderId Market order id
     */
    function cancelOrder(
        bytes32 _ccy,
        uint256 _maturity,
        uint48 _orderId
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        (ProtocolTypes.Side side, uint256 amount, uint256 unitPrice) = ILendingMarket(market)
            .cancelOrder(msg.sender, _orderId);

        emit CancelOrder(_orderId, msg.sender, _ccy, side, _maturity, amount, unitPrice);

        return true;
    }

    /**
     * @notice Liquidates a lending position if the user's coverage is less than 1.
     * @dev A liquidation amount is calculated from the selected debt, but its maximum amount is the same as a collateral amount.
     * That amount needs to be set at liquidationAmountMax otherwise currency swapping using Uniswap will fail
     * if the collateral is insufficient.
     * @param _collateralCcy Currency name to be used as collateral
     * @param _debtCcy Currency name to be used as debt
     * @param _debtMaturity The market maturity of the debt
     * @param _user User's address
     * @param _poolFee Uniswap pool fee
     * @return True if the execution of the operation succeeds
     */
    function executeLiquidationCall(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) external override nonReentrant ifValidMaturity(_debtCcy, _debtMaturity) returns (bool) {
        // In order to liquidate using user collateral, inactive order IDs must be cleaned
        // and converted to actual funds first.
        cleanOrders(_debtCcy, _user);

        uint256 liquidationAmount = FundCalculationLogic.convertToLiquidationAmountFromCollateral(
            msg.sender,
            _user,
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            _poolFee
        );

        _createOrder(
            _debtCcy,
            _debtMaturity,
            _user,
            ProtocolTypes.Side.LEND,
            liquidationAmount,
            0,
            true
        );

        emit Liquidate(_user, _collateralCcy, _debtCcy, _debtMaturity, liquidationAmount);

        _convertFutureValueToGenesisValue(_debtCcy, _debtMaturity, _user);

        return true;
    }

    /**
     * @notice Rotates the lending markets. In this rotation, the following actions are happened.
     * - Updates the maturity at the beginning of the market array.
     * - Moves the beginning of the market array to the end of it (Market rotation).
     * - Update the compound factor in this contract using the next market unit price. (Auto-rolls)
     *
     * @param _ccy Currency name in bytes32 of the selected market
     */
    function rotateLendingMarkets(bytes32 _ccy)
        external
        override
        nonReentrant
        hasLendingMarket(_ccy)
    {
        address[] storage markets = Storage.slot().lendingMarkets[_ccy];
        address currentMarketAddr = markets[0];
        address nextMarketAddr = markets[1];

        // Reopen the market matured with new maturity
        uint256 newLastMaturity = TimeLibrary.addMonths(
            ILendingMarket(markets[markets.length - 1]).getMaturity(),
            BASIS_TERM
        );
        uint256 prevMaturity = ILendingMarket(currentMarketAddr).openMarket(newLastMaturity);

        // Rotate the order of the market
        for (uint256 i = 0; i < markets.length; i++) {
            address marketAddr = (markets.length - 1) == i ? currentMarketAddr : markets[i + 1];
            markets[i] = marketAddr;
        }

        genesisValueVault().updateCompoundFactor(
            _ccy,
            prevMaturity,
            ILendingMarket(nextMarketAddr).getMaturity(),
            ILendingMarket(nextMarketAddr).getMidUnitPrice()
        );

        Storage.slot().maturityLendingMarkets[_ccy][newLastMaturity] = currentMarketAddr;
        delete Storage.slot().maturityLendingMarkets[_ccy][prevMaturity];

        emit RotateLendingMarkets(_ccy, prevMaturity, newLastMaturity);
    }

    /**
     * @notice Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     * @return True if the execution of the operation succeeds
     */
    function pauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            market.pauseMarket();
        }

        return true;
    }

    /**
     * @notice Unpauses previously deployed lending market by currency
     * @param _ccy Currency name in bytes32
     * @return True if the execution of the operation succeeds
     */
    function unpauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            market.unpauseMarket();
        }

        return true;
    }

    /**
     * @notice Cleans user's all orders to remove order ids that are already filled on the order book.
     * @param _user User's address
     */
    function cleanAllOrders(address _user) public override {
        EnumerableSet.Bytes32Set storage ccySet = Storage.slot().usedCurrencies[_user];
        for (uint256 i = 0; i < ccySet.length(); i++) {
            cleanOrders(ccySet.at(i), _user);
        }
    }

    /**
     * @notice Cleans user's orders to remove order ids that are already filled on the order book for a selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     */
    function cleanOrders(bytes32 _ccy, address _user)
        public
        override
        returns (uint256 totalActiveOrderCount)
    {
        EnumerableSet.Bytes32Set storage ccySet = Storage.slot().usedCurrencies[_user];
        if (!ccySet.contains(_ccy)) {
            return 0;
        }

        bool futureValueExists = false;
        uint256[] memory maturities = getMaturities(_ccy);

        for (uint256 j = 0; j < maturities.length; j++) {
            int256 currentFutureValue = _convertFutureValueToGenesisValue(
                _ccy,
                maturities[j],
                _user
            );

            (uint256 activeOrderCount, bool isCleaned) = _cleanOrders(_ccy, maturities[j], _user);
            totalActiveOrderCount += activeOrderCount;

            if (currentFutureValue != 0 || isCleaned) {
                futureValueExists = true;
            }
        }

        if (
            totalActiveOrderCount == 0 &&
            !futureValueExists &&
            genesisValueVault().getGenesisValue(_ccy, _user) == 0
        ) {
            Storage.slot().usedCurrencies[_user].remove(_ccy);
        }
    }

    /**
     * @notice Converts the future value to the genesis value if there is balance in the past maturity.
     * @param _ccy Currency for pausing all lending markets
     * @param _user User's address
     * @return Current future value amount after update
     */
    function _convertFutureValueToGenesisValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) private returns (int256) {
        address futureValueVault = Storage.slot().futureValueVaults[_ccy][
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ];
        (int256 removedAmount, int256 currentAmount, uint256 basisMaturity) = IFutureValueVault(
            futureValueVault
        ).removeFutureValue(_user, _maturity);

        if (removedAmount != 0) {
            genesisValueVault().addGenesisValue(_ccy, _user, basisMaturity, removedAmount);
        }

        return currentAmount;
    }

    function _createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        bool _isForced
    ) private returns (bool isFilled) {
        require(_amount > 0, "Invalid amount");
        uint256 activeOrderCount = cleanOrders(_ccy, _user);

        if (!_isForced) {
            require(tokenVault().isCovered(_user, _ccy, _amount, _side), "Not enough collateral");
        }

        (uint256 filledFutureValue, uint256 remainingAmount) = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ).createOrder(_side, _user, _amount, _unitPrice, _isForced);

        if (!_isForced) {
            // The case that an order was made, or taken partially
            if (filledFutureValue == 0 || remainingAmount > 0) {
                activeOrderCount += 1;
            }

            require(activeOrderCount <= MAXIMUM_ORDER_COUNT, "Too many active orders");
        }

        if (filledFutureValue != 0) {
            address futureValueVault = Storage.slot().futureValueVaults[_ccy][
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ];

            if (_side == ProtocolTypes.Side.BORROW) {
                tokenVault().addDepositAmount(_user, _ccy, _amount - remainingAmount);
                IFutureValueVault(futureValueVault).addBorrowFutureValue(
                    _user,
                    filledFutureValue,
                    _maturity
                );
            } else {
                tokenVault().removeDepositAmount(_user, _ccy, _amount - remainingAmount);
                IFutureValueVault(futureValueVault).addLendFutureValue(
                    _user,
                    filledFutureValue,
                    _maturity
                );
            }

            emit FillOrder(_user, _ccy, _side, _maturity, _amount, _unitPrice, filledFutureValue);

            isFilled = true;
        }

        Storage.slot().usedCurrencies[_user].add(_ccy);
    }

    function _cleanOrders(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) private returns (uint256 activeOrderCount, bool isCleaned) {
        address futureValueVault = getFutureValueVault(_ccy, _maturity);

        (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 removedLendOrderAmount,
            uint256 removedBorrowOrderAmount,
            uint256 userCurrentMaturity
        ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).cleanOrders(
                _user
            );

        if (removedLendOrderAmount > removedBorrowOrderAmount) {
            tokenVault().removeDepositAmount(
                _user,
                _ccy,
                removedLendOrderAmount - removedBorrowOrderAmount
            );
        } else if (removedLendOrderAmount < removedBorrowOrderAmount) {
            tokenVault().addDepositAmount(
                _user,
                _ccy,
                removedBorrowOrderAmount - removedLendOrderAmount
            );
        }

        if (removedLendOrderFutureValue > 0) {
            IFutureValueVault(futureValueVault).addLendFutureValue(
                _user,
                removedLendOrderFutureValue,
                userCurrentMaturity
            );
            emit FillOrdersAsync(
                _user,
                _ccy,
                ProtocolTypes.Side.LEND,
                userCurrentMaturity,
                removedLendOrderFutureValue
            );
        }

        if (removedBorrowOrderFutureValue > 0) {
            IFutureValueVault(futureValueVault).addBorrowFutureValue(
                _user,
                removedBorrowOrderFutureValue,
                userCurrentMaturity
            );
            emit FillOrdersAsync(
                _user,
                _ccy,
                ProtocolTypes.Side.BORROW,
                userCurrentMaturity,
                removedBorrowOrderFutureValue
            );
        }

        isCleaned = (removedLendOrderFutureValue + removedBorrowOrderFutureValue) > 0;
        activeOrderCount = activeLendOrderCount + activeBorrowOrderCount;
    }
}
