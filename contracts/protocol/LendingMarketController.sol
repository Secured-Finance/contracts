// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// dependencies
import {ReentrancyGuard} from "../dependencies/openzeppelin/security/ReentrancyGuard.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarketController} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {FundManagementLogic} from "./libraries/logics/FundManagementLogic.sol";
import {LendingMarketOperationLogic} from "./libraries/logics/LendingMarketOperationLogic.sol";
import {LendingMarketUserLogic} from "./libraries/logics/LendingMarketUserLogic.sol";
import {LiquidationLogic} from "./libraries/logics/LiquidationLogic.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinLendingMarketConfiguration} from "./mixins/MixinLendingMarketConfiguration.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Proxyable} from "./utils/Proxyable.sol";
import {LockAndMsgSender} from "./utils/LockAndMsgSender.sol";
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
 * The users mainly call this contract to execute orders to lend or borrow funds.
 */
contract LendingMarketController is
    ILendingMarketController,
    MixinLendingMarketConfiguration,
    MixinAddressResolver,
    ReentrancyGuard,
    Proxyable,
    LockAndMsgSender
{
    using EnumerableSet for EnumerableSet.Bytes32Set;

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
     * @notice Modifier to check if the protocol is active.
     */
    modifier ifActive() {
        require(!isTerminated(), "Already terminated");
        _;
    }

    /**
     * @notice Modifier to check if the protocol is inactive.
     */
    modifier ifInactive() {
        require(isTerminated(), "Not terminated");
        _;
    }

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController.
     * @param _owner The address of the contract owner
     * @param _resolver The address of the Address Resolver contract
     * @param _marketBasePeriod The base period for market maturity
     * @param _observationPeriod The observation period to calculate the volume-weighted average price of transactions
     */
    function initialize(
        address _owner,
        address _resolver,
        uint256 _marketBasePeriod,
        uint256 _observationPeriod
    ) public initializer onlyProxy {
        Storage.slot().marketBasePeriod = _marketBasePeriod;
        MixinLendingMarketConfiguration._initialize(_owner, _observationPeriod);
        registerAddressResolver(_resolver);
    }

    // @inheritdoc MixinAddressResolver
    function afterBuildCache() internal override {
        Storage.slot().baseCurrency = currencyController().getBaseCurrency();
    }

    // @inheritdoc MixinAddressResolver
    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](5);
        contracts[0] = Contracts.BEACON_PROXY_CONTROLLER;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.GENESIS_VALUE_VAULT;
        contracts[3] = Contracts.RESERVE_FUND;
        contracts[4] = Contracts.TOKEN_VAULT;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.TOKEN_VAULT;
    }

    /**
     * @notice Gets if the protocol has not been terminated.
     * @return The boolean if the protocol has not been terminated
     */
    function isTerminated() public view override returns (bool) {
        return Storage.slot().marketTerminationDate > 0;
    }

    /**
     * @notice Gets if the user needs to redeem the funds.
     * @return The boolean if the user needs to redeem the funds
     */
    function isRedemptionRequired(address _user) external view override returns (bool) {
        return isTerminated() && !Storage.slot().isRedeemed[_user];
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
     * @notice Gets detailed information on the lending market.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     * @return bestLendUnitPrice The best lend price per future value
     * @return bestBorrowUnitPrice The best borrow price per future value
     * @return midUnitPrice The mid price per future value
     * @return maxLendUnitPrice The maximum unit price for lending
     * @return minBorrowUnitPrice The minimum unit price for borrowing
     * @return openingUnitPrice The opening price when Itayose is executed
     * @return openingDate The timestamp when the market opens
     * @return isReady The boolean if the market is ready or not
     */
    function getLendingMarketDetail(bytes32 _ccy, uint256 _maturity)
        external
        view
        returns (
            uint256 bestLendUnitPrice,
            uint256 bestBorrowUnitPrice,
            uint256 midUnitPrice,
            uint256 maxLendUnitPrice,
            uint256 minBorrowUnitPrice,
            uint256 openingUnitPrice,
            uint256 openingDate,
            bool isReady
        )
    {
        return LendingMarketOperationLogic.getLendingMarketDetail(_ccy, _maturity);
    }

    /**
     * @notice Gets the array of detailed information on the lending market.
     * @param _ccys Currency name list in bytes32
     * @return lendingMarketDetails The array of Detailed information on the lending market.
     */
    function getLendingMarketDetails(bytes32[] memory _ccys)
        external
        view
        returns (LendingMarketDetail[] memory lendingMarketDetails)
    {
        return LendingMarketOperationLogic.getLendingMarketDetails(_ccys);
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
     * @notice Gets the estimated order result by the calculation of the amount to be filled when executing an order in the order books.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @param _additionalDepositAmount Additional amount to be deposited with the lending order
     * @param _ignoreBorrowedAmount The boolean if the borrowed amount is ignored and not used as collateral or not
     * @return lastUnitPrice The last unit price that is filled on the order book
     * @return filledAmount The amount that is filled on the order book
     * @return filledAmountInFV The amount in the future value that is filled on the order book
     * @return orderFeeInFV The order fee amount in the future value
     * @return coverage The rate of collateral used
     * @return isInsufficientDepositAmount The boolean if the order amount for lending in the selected currency is insufficient
     * for the deposit amount or not
     */
    function getOrderEstimation(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        uint256 _additionalDepositAmount,
        bool _ignoreBorrowedAmount
    )
        external
        view
        override
        returns (
            uint256 lastUnitPrice,
            uint256 filledAmount,
            uint256 filledAmountInFV,
            uint256 orderFeeInFV,
            uint256 coverage,
            bool isInsufficientDepositAmount
        )
    {
        return
            LendingMarketUserLogic.getOrderEstimation(
                _ccy,
                _maturity,
                msg.sender,
                _side,
                _amount,
                _unitPrice,
                _additionalDepositAmount,
                _ignoreBorrowedAmount
            );
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
        totalPresentValue = FundManagementLogic.calculateActualFunds(_ccy, 0, _user).presentValue;
    }

    /**
     * @notice Gets the total present value of the account converted to base currency.
     * @param _user User's address
     * @return totalPresentValue The total present value in base currency
     */
    function getTotalPresentValueInBaseCurrency(address _user)
        external
        view
        override
        returns (int256 totalPresentValue)
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            int256 amount = FundManagementLogic.calculateActualFunds(ccy, 0, _user).presentValue;
            totalPresentValue += currencyController().convertToBaseCurrency(ccy, amount);
        }
    }

    /**
     * @notice Gets the genesis value of the account.
     * @param _ccy Currency name in bytes32 for Lending Market
     * @param _user User's address
     * @return genesisValue The genesis value
     */
    function getGenesisValue(bytes32 _ccy, address _user)
        external
        view
        override
        returns (int256 genesisValue)
    {
        genesisValue = FundManagementLogic.calculateActualFunds(_ccy, 0, _user).genesisValue;
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
        override
        returns (Order[] memory activeOrders, Order[] memory inactiveOrders)
    {
        (activeOrders, inactiveOrders) = LendingMarketUserLogic.getOrders(_ccys, _user);
    }

    /**
     * @notice Gets user's active position from the future value vault
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the selected market
     * @param _user User's address
     * @return presentValue The present value of the position
     * @return futureValue The future value of the position
     */
    function getPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external view override returns (int256 presentValue, int256 futureValue) {
        (presentValue, futureValue) = FundManagementLogic.getPosition(_ccy, _maturity, _user);
    }

    /**
     * @notice Gets user's active positions from the future value vaults
     * @param _ccys Currency name list in bytes32
     * @param _user User's address
     * @return positions The array of active positions
     */
    function getPositions(bytes32[] memory _ccys, address _user)
        external
        view
        override
        returns (Position[] memory positions)
    {
        positions = FundManagementLogic.getPositions(_ccys, _user);
    }

    /**
     * @notice Gets the funds that are calculated from the user's lending and borrowing order list
     * for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @param _liquidationThresholdRate The liquidation threshold rate
     * @return workingLendOrdersAmount The working orders amount on the lend order book
     * @return claimableAmount The claimable amount due to the lending orders being filled on the order book
     * @return collateralAmount The actual collateral amount that is calculated by netting using the haircut.
     * @return lentAmount The lent amount due to the lend orders being filled on the order book
     * @return workingBorrowOrdersAmount The working orders amount on the borrow order book
     * @return debtAmount The debt amount due to the borrow orders being filled on the order book
     * @return borrowedAmount The borrowed amount due to the borrow orders being filled on the order book
     */
    function calculateFunds(
        bytes32 _ccy,
        address _user,
        uint256 _liquidationThresholdRate
    )
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
            AdditionalFunds memory emptyAdditionalFunds;

            return
                FundManagementLogic.calculateFunds(
                    _ccy,
                    _user,
                    emptyAdditionalFunds,
                    _liquidationThresholdRate
                );
        }
    }

    /**
     * @notice Gets the funds that are calculated from the user's lending and borrowing order list
     * for all currencies in base currency.
     * @param _user User's address
     * @param _additionalFunds The funds to be added for calculating the total funds
     * @param _liquidationThresholdRate The liquidation threshold rate
     */
    function calculateTotalFundsInBaseCurrency(
        address _user,
        AdditionalFunds calldata _additionalFunds,
        uint256 _liquidationThresholdRate
    )
        external
        view
        override
        returns (
            uint256 plusDepositAmountInAdditionalFundsCcy,
            uint256 minusDepositAmountInAdditionalFundsCcy,
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount
        )
    {
        return
            FundManagementLogic.calculateTotalFundsInBaseCurrency(
                _user,
                _additionalFunds,
                _liquidationThresholdRate
            );
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
     * @param _orderFeeRate The order fee rate received by protocol
     * @param _circuitBreakerLimitRange The circuit breaker limit range
     */
    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor,
        uint256 _orderFeeRate,
        uint256 _circuitBreakerLimitRange
    ) external override onlyOwner {
        require(_compoundFactor > 0, "Invalid compound factor");
        require(!isInitializedLendingMarket(_ccy), "Already initialized");

        LendingMarketOperationLogic.initializeCurrencySetting(_ccy, _genesisDate, _compoundFactor);
        updateOrderFeeRate(_ccy, _orderFeeRate);
        updateCircuitBreakerLimitRange(_ccy, _circuitBreakerLimitRange);
    }

    /**
     * @notice Deploys new Lending Market and save address at lendingMarkets mapping.
     * @param _ccy Main currency for new lending market
     * @param _openingDate Timestamp when the lending market opens
     * @notice Reverts on deployment market with existing currency and term
     */
    function createLendingMarket(bytes32 _ccy, uint256 _openingDate)
        external
        override
        ifActive
        onlyOwner
    {
        LendingMarketOperationLogic.createLendingMarket(_ccy, _openingDate);
    }

    /**
     * @notice Executes an order. Takes orders if the order is matched,
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
    function executeOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) ifActive returns (bool) {
        LendingMarketUserLogic.executeOrder(
            _ccy,
            _maturity,
            msg.sender,
            _side,
            _amount,
            _unitPrice
        );
        return true;
    }

    /**
     * @notice Deposits funds and executes an order at the same time.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function depositAndExecuteOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        external
        payable
        override
        nonReentrant
        ifValidMaturity(_ccy, _maturity)
        ifActive
        returns (bool)
    {
        tokenVault().depositFrom{value: msg.value}(msg.sender, _ccy, _amount);
        LendingMarketUserLogic.executeOrder(
            _ccy,
            _maturity,
            msg.sender,
            _side,
            _amount,
            _unitPrice
        );
        return true;
    }

    /**
     * @notice Executes a pre-order. A pre-order will only be accepted from 168 hours (7 days) to 1 hour
     * before the market opens (Pre-order period). At the end of this period, Itayose will be executed.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function executePreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) public override nonReentrant ifValidMaturity(_ccy, _maturity) ifActive returns (bool) {
        LendingMarketUserLogic.executePreOrder(
            _ccy,
            _maturity,
            msg.sender,
            _side,
            _amount,
            _unitPrice
        );

        return true;
    }

    /**
     * @notice Deposits funds and executes a pre-order at the same time.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function depositAndExecutesPreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    )
        external
        payable
        override
        nonReentrant
        ifValidMaturity(_ccy, _maturity)
        ifActive
        returns (bool)
    {
        tokenVault().depositFrom{value: msg.value}(msg.sender, _ccy, _amount);
        LendingMarketUserLogic.executePreOrder(
            _ccy,
            _maturity,
            msg.sender,
            _side,
            _amount,
            _unitPrice
        );

        return true;
    }

    /**
     * @notice Unwinds user's lending or borrowing positions by creating an opposite position order.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     */
    function unwindPosition(bytes32 _ccy, uint256 _maturity)
        external
        override
        nonReentrant
        ifValidMaturity(_ccy, _maturity)
        ifActive
        returns (bool)
    {
        LendingMarketUserLogic.unwindPosition(_ccy, _maturity, msg.sender);
        return true;
    }

    /**
     * @notice Redeem user's lending positions.
     * Redemption can only be executed once the market has matured after the currency has been delisted.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     */
    function executeRedemption(bytes32 _ccy, uint256 _maturity)
        external
        override
        nonReentrant
        ifValidMaturity(_ccy, _maturity)
        ifActive
        returns (bool)
    {
        FundManagementLogic.executeRedemption(_ccy, _maturity, msg.sender);
        return true;
    }

    /**
     * @notice Repay user's borrowing positions.
     * Repayment can only be executed once the market has matured after the currency has been delisted.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     */
    function executeRepayment(bytes32 _ccy, uint256 _maturity)
        external
        override
        nonReentrant
        ifValidMaturity(_ccy, _maturity)
        ifActive
        returns (bool)
    {
        FundManagementLogic.executeRepayment(_ccy, _maturity, msg.sender, 0);
        return true;
    }

    /**
     * @notice Force settlement of all lending and borrowing positions.
     * This function is executed under the present value as of the termination date.
     *
     * @return True if the execution of the operation succeeds
     */
    function executeEmergencySettlement() external override nonReentrant ifInactive returns (bool) {
        FundManagementLogic.executeEmergencySettlement(msg.sender);
        return true;
    }

    /**
     * @notice Executes Itayose calls per selected currencies.
     * @param _currencies Currency name list in bytes32
     * @param _maturity The maturity of the selected market
     */
    function executeItayoseCalls(bytes32[] memory _currencies, uint256 _maturity)
        external
        override
        nonReentrant
        ifActive
        returns (bool)
    {
        for (uint256 i; i < _currencies.length; i++) {
            bytes32 ccy = _currencies[i];

            (
                ILendingMarket.PartiallyFilledOrder memory partiallyFilledLendingOrder,
                ILendingMarket.PartiallyFilledOrder memory partiallyFilledBorrowingOrder
            ) = LendingMarketOperationLogic.executeItayoseCall(ccy, _maturity);

            LendingMarketUserLogic.updateFundsForMaker(
                ccy,
                _maturity,
                ProtocolTypes.Side.LEND,
                partiallyFilledLendingOrder
            );
            LendingMarketUserLogic.updateFundsForMaker(
                ccy,
                _maturity,
                ProtocolTypes.Side.BORROW,
                partiallyFilledBorrowingOrder
            );
        }

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
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) ifActive returns (bool) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        ILendingMarket(market).cancelOrder(msg.sender, _orderId);

        return true;
    }

    /**
     * @notice Liquidates a lending or borrowing position if the user's coverage is hight.
     * @param _collateralCcy Currency name to be used as collateral
     * @param _debtCcy Currency name to be used as debt
     * @param _debtMaturity The market maturity of the debt
     * @param _user User's address
     * @return True if the execution of the operation succeeds
     */
    function executeLiquidationCall(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    )
        external
        override
        isNotLocked
        ifValidMaturity(_debtCcy, _debtMaturity)
        ifActive
        returns (bool)
    {
        LiquidationLogic.executeLiquidation(
            msg.sender,
            _user,
            _collateralCcy,
            _debtCcy,
            _debtMaturity
        );

        return true;
    }

    /**
     * @notice Execute forced repayment for a borrowing position if repayment date is over.
     * @param _collateralCcy Currency name to be used as collateral
     * @param _debtCcy Currency name to be used as debt
     * @param _debtMaturity The market maturity of the debt
     * @param _user User's address
     * @return True if the execution of the operation succeeds
     */
    function executeForcedRepayment(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    )
        external
        override
        isNotLocked
        ifValidMaturity(_debtCcy, _debtMaturity)
        ifActive
        returns (bool)
    {
        LiquidationLogic.executeForcedRepayment(
            msg.sender,
            _user,
            _collateralCcy,
            _debtCcy,
            _debtMaturity
        );

        return true;
    }

    /**
     * @notice Rotates the lending markets. In this rotation, the following actions are happened.
     * - Updates the maturity at the beginning of the market array.
     * - Moves the beginning of the market array to the end of it (Market rotation).
     * - Update the compound factor in this contract using the next market unit price. (Auto-rolls)
     * - Convert the future value held by reserve funds into the genesis value
     *
     * @param _ccy Currency name in bytes32 of the selected market
     */
    function rotateLendingMarkets(bytes32 _ccy)
        external
        override
        nonReentrant
        hasLendingMarket(_ccy)
        ifActive
    {
        require(currencyController().currencyExists(_ccy), "Invalid currency");

        uint256 newMaturity = LendingMarketOperationLogic.rotateLendingMarkets(
            _ccy,
            getOrderFeeRate(_ccy)
        );

        FundManagementLogic.convertFutureValueToGenesisValue(
            _ccy,
            newMaturity,
            address(reserveFund())
        );
    }

    /**
     * @notice Executes an emergency termination to stop the protocol. Once this function is executed,
     * the protocol cannot be run again. Also, users will only be able to redeem and withdraw.
     */
    function executeEmergencyTermination() external override ifActive onlyOwner {
        LendingMarketOperationLogic.executeEmergencyTermination();
    }

    /**
     * @notice Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     * @return True if the execution of the operation succeeds
     */
    function pauseLendingMarkets(bytes32 _ccy) external override ifActive onlyOwner returns (bool) {
        LendingMarketOperationLogic.pauseLendingMarkets(_ccy);
        return true;
    }

    /**
     * @notice Unpauses previously deployed lending market by currency
     * @param _ccy Currency name in bytes32
     * @return True if the execution of the operation succeeds
     */
    function unpauseLendingMarkets(bytes32 _ccy)
        external
        override
        ifActive
        onlyOwner
        returns (bool)
    {
        LendingMarketOperationLogic.unpauseLendingMarkets(_ccy);
        return true;
    }

    /**
     * @notice Clean up all funds of the user
     * @param _user User's address
     */
    function cleanUpAllFunds(address _user) external override nonReentrant returns (bool) {
        FundManagementLogic.cleanUpAllFunds(_user);
        return true;
    }

    /**
     * @notice Clean up user funds used for lazy evaluation by the following actions:
     * - Removes order IDs that is already filled on the order book.
     * - Convert Future values that have already been auto-rolled to Genesis values.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     */
    function cleanUpFunds(bytes32 _ccy, address _user)
        external
        override
        nonReentrant
        returns (uint256 totalActiveOrderCount)
    {
        return FundManagementLogic.cleanUpFunds(_ccy, _user);
    }
}
