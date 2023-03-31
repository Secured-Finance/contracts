// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarketController} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "./interfaces/IFutureValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {LiquidatorHandler} from "./libraries/LiquidatorHandler.sol";
import {FundManagementLogic} from "./libraries/logics/FundManagementLogic.sol";
import {LendingMarketOperationLogic} from "./libraries/logics/LendingMarketOperationLogic.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinLendingMarketManager} from "./mixins/MixinLendingMarketManager.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
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
    MixinLendingMarketManager,
    MixinAddressResolver,
    ReentrancyGuard,
    Proxyable
{
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeCast for int256;

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
        MixinLendingMarketManager._initialize(_owner, _observationPeriod);
        registerAddressResolver(_resolver);
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
    function isTerminated() public view returns (bool) {
        return Storage.slot().marketTerminationDate > 0;
    }

    /**
     * @notice Gets if the user is registered as a liquidator.
     * @return The boolean if the user is registered as a liquidator or not
     */
    function isLiquidator(address _user) external view override returns (bool) {
        return LiquidatorHandler.isRegistered(_user);
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
        futureValue = FundManagementLogic.calculateActualFunds(_ccy, _maturity, _user).futureValue;
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
        presentValue = FundManagementLogic
            .calculateActualFunds(_ccy, _maturity, _user)
            .presentValue;
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
            int256 amount = FundManagementLogic.calculateActualFunds(ccy, 0, _user).presentValue;
            totalPresentValue += currencyController().convertToETH(ccy, amount);
        }
    }

    function getGenesisValue(bytes32 _ccy, address _user)
        external
        view
        override
        returns (int256 genesisValue)
    {
        genesisValue = FundManagementLogic.calculateActualFunds(_ccy, 0, _user).genesisValue;
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
            return FundManagementLogic.calculateFunds(_ccy, _user);
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
        return FundManagementLogic.calculateTotalFundsInETH(_user, _depositCcy, _depositAmount);
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
     * @param _autoRollFeeRate The auto roll fee rate received by protocol
     */
    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor,
        uint256 _orderFeeRate,
        uint256 _autoRollFeeRate
    ) external override onlyOwner {
        require(_compoundFactor > 0, "Invalid compound factor");
        require(!isInitializedLendingMarket(_ccy), "Already initialized");

        LendingMarketOperationLogic.initializeCurrencySetting(_ccy, _genesisDate, _compoundFactor);
        updateOrderFeeRate(_ccy, _orderFeeRate);
        updateAutoRollFeeRate(_ccy, _autoRollFeeRate);
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
        (address market, address futureValueVault, uint256 maturity) = LendingMarketOperationLogic
            .createLendingMarket(_ccy, _openingDate);

        emit LendingMarketCreated(
            _ccy,
            market,
            futureValueVault,
            Storage.slot().lendingMarkets[_ccy].length,
            _openingDate,
            maturity
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
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) ifActive returns (bool) {
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
        _createOrder(_ccy, _maturity, msg.sender, _side, _amount, _unitPrice, false);

        return true;
    }

    /**
     * @notice Creates a pre-order. A pre-order will only be accepted from 48 hours to 1 hour
     * before the market opens (Pre-order period). At the end of this period, Itayose will be executed.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createPreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) public override nonReentrant ifValidMaturity(_ccy, _maturity) ifActive returns (bool) {
        _createPreOrder(_ccy, _maturity, _side, _amount, _unitPrice);

        return true;
    }

    /**
     * @notice Deposits funds and creates a pre-order at the same time.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function depositAndCreatePreOrder(
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
        _createPreOrder(_ccy, _maturity, _side, _amount, _unitPrice);

        return true;
    }

    /**
     * @notice Unwinds all orders by creating an opposite position order.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     */
    function unwindOrder(bytes32 _ccy, uint256 _maturity)
        external
        override
        nonReentrant
        ifValidMaturity(_ccy, _maturity)
        ifActive
        returns (bool)
    {
        FundManagementLogic.cleanUpFunds(_ccy, msg.sender);

        (int256 futureValue, uint256 fvMaturity) = IFutureValueVault(
            getFutureValueVault(_ccy, _maturity)
        ).getFutureValue(msg.sender);

        require(futureValue != 0, "Future Value is zero");
        require(_maturity == fvMaturity, "Invalid maturity");

        uint256 filledUnitPrice;
        uint256 filledAmount;
        uint256 filledFutureValue;
        ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder;
        ProtocolTypes.Side side;

        if (futureValue > 0) {
            side = ProtocolTypes.Side.BORROW;
            (
                filledUnitPrice,
                filledAmount,
                filledFutureValue,
                partiallyFilledOrder
            ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).unwindOrder(
                side,
                msg.sender,
                futureValue.toUint256()
            );
        } else if (futureValue < 0) {
            side = ProtocolTypes.Side.LEND;
            (
                filledUnitPrice,
                filledAmount,
                filledFutureValue,
                partiallyFilledOrder
            ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).unwindOrder(
                side,
                msg.sender,
                (-futureValue).toUint256()
            );
        }

        _updateFundsForTaker(
            _ccy,
            _maturity,
            msg.sender,
            side,
            filledAmount,
            filledFutureValue,
            filledUnitPrice,
            0
        );

        _updateFundsForMaker(
            _ccy,
            _maturity,
            side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        return true;
    }

    /**
     * @notice Redeems all lending and borrowing positions.
     * This function uses the present value as of the termination date.
     */
    function executeRedemption() external override nonReentrant ifInactive returns (bool) {
        int256 redemptionAmount = FundManagementLogic.resetFutureValues(msg.sender);
        FundManagementLogic.updateDepositsBasedOnMarketTerminationPrice(
            msg.sender,
            redemptionAmount
        );

        emit RedemptionExecuted(msg.sender, redemptionAmount);
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

            _updateFundsForMaker(
                ccy,
                _maturity,
                ProtocolTypes.Side.LEND,
                partiallyFilledLendingOrder
            );
            _updateFundsForMaker(
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
    )
        external
        override
        nonReentrant
        ifValidMaturity(_debtCcy, _debtMaturity)
        ifActive
        returns (bool)
    {
        // Check if the caller is an EOA registered as an active liquidator to protect against flash loan attacks.
        require(Address.isContract(msg.sender) == false, "Caller must be EOA");
        require(LiquidatorHandler.isActive(msg.sender), "Caller is not active");

        // In order to liquidate using user collateral, inactive order IDs must be cleaned
        // and converted to actual funds first.
        FundManagementLogic.cleanUpFunds(_debtCcy, _user);

        (uint256 liquidationPVAmount, uint256 offsetPVAmount) = FundManagementLogic
            .convertToLiquidationAmountFromCollateral(
                msg.sender,
                _user,
                _collateralCcy,
                _debtCcy,
                _debtMaturity,
                _poolFee
            );

        uint256 executedPVAmount = offsetPVAmount;
        if (liquidationPVAmount > 0) {
            uint256 filledAmount = _createOrder(
                _debtCcy,
                _debtMaturity,
                _user,
                ProtocolTypes.Side.LEND,
                liquidationPVAmount,
                0, // market order
                true
            );
            executedPVAmount += filledAmount;
        }

        if (executedPVAmount != 0) {
            emit LiquidationExecuted(
                _user,
                _collateralCcy,
                _debtCcy,
                _debtMaturity,
                executedPVAmount
            );

            FundManagementLogic.convertFutureValueToGenesisValue(_debtCcy, _debtMaturity, _user);
        }

        return true;
    }

    /**
     * @notice Registers a user as a liquidator.
     * @param _isLiquidator The boolean if the user is a liquidator or not
     */
    function registerLiquidator(bool _isLiquidator) external override {
        if (_isLiquidator) {
            LiquidatorHandler.register(msg.sender);
        } else {
            LiquidatorHandler.remove(msg.sender);
        }
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
        (uint256 fromMaturity, uint256 toMaturity) = LendingMarketOperationLogic
            .rotateLendingMarkets(_ccy, getAutoRollFeeRate(_ccy));

        FundManagementLogic.convertFutureValueToGenesisValue(
            _ccy,
            toMaturity,
            address(reserveFund())
        );

        emit LendingMarketsRotated(_ccy, fromMaturity, toMaturity);
    }

    /**
     * @notice Executes an emergency termination to stop the protocol. Once this function is executed,
     * the protocol cannot be run again. Also, users will only be able to redeem and withdraw.
     */
    function executeEmergencyTermination() external nonReentrant ifActive onlyOwner {
        LendingMarketOperationLogic.executeEmergencyTermination();

        emit EmergencyTerminationExecuted(block.timestamp);
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
    function cleanUpAllFunds(address _user) public override {
        EnumerableSet.Bytes32Set storage ccySet = Storage.slot().usedCurrencies[_user];
        for (uint256 i = 0; i < ccySet.length(); i++) {
            FundManagementLogic.cleanUpFunds(ccySet.at(i), _user);
        }
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
        returns (uint256 totalActiveOrderCount)
    {
        return FundManagementLogic.cleanUpFunds(_ccy, _user);
    }

    function _createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice,
        bool _isForced
    ) private returns (uint256 filledAmount) {
        require(_amount > 0, "Invalid amount");
        uint256 activeOrderCount = FundManagementLogic.cleanUpFunds(_ccy, _user);

        if (!Storage.slot().usedMaturities[_ccy][_user].contains(_maturity)) {
            Storage.slot().usedMaturities[_ccy][_user].add(_maturity);
        }

        if (!_isForced) {
            require(tokenVault().isCovered(_user, _ccy, _amount, _side), "Not enough collateral");
        }

        (
            uint256 filledUnitPrice,
            uint256 filledFutureValue,
            ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder,
            uint256 remainingAmount
        ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).createOrder(
                _side,
                _user,
                _amount,
                _unitPrice,
                _isForced
            );
        filledAmount = _amount - remainingAmount;

        uint256 feeFutureValue;
        if (!_isForced) {
            // The case that an order was made, or taken partially
            if (filledFutureValue == 0 || remainingAmount > 0) {
                activeOrderCount += 1;
            }

            require(
                activeOrderCount <= ProtocolTypes.MAXIMUM_ORDER_COUNT,
                "Too many active orders"
            );

            feeFutureValue = _calculateOrderFeeAmount(_ccy, filledFutureValue, _maturity);
        }

        _updateFundsForTaker(
            _ccy,
            _maturity,
            _user,
            _side,
            filledAmount,
            filledFutureValue,
            filledUnitPrice,
            feeFutureValue
        );

        _updateFundsForMaker(
            _ccy,
            _maturity,
            _side == ProtocolTypes.Side.LEND ? ProtocolTypes.Side.BORROW : ProtocolTypes.Side.LEND,
            partiallyFilledOrder
        );

        Storage.slot().usedCurrencies[_user].add(_ccy);
    }

    function _updateFundsForTaker(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _filledAmount,
        uint256 _filledFutureValue,
        uint256 _filledUnitPrice,
        uint256 _feeFutureValue
    ) private {
        if (_filledFutureValue != 0) {
            FundManagementLogic.updateFunds(
                _ccy,
                _maturity,
                _user,
                _side,
                _filledFutureValue,
                _filledAmount,
                _feeFutureValue
            );

            LendingMarketOperationLogic.updateOrderLogs(
                _ccy,
                _maturity,
                getObservationPeriod(),
                _filledUnitPrice,
                _filledAmount,
                _filledFutureValue
            );
        }
    }

    function _updateFundsForMaker(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder
    ) private {
        if (partiallyFilledOrder.futureValue != 0) {
            FundManagementLogic.updateFunds(
                _ccy,
                _maturity,
                partiallyFilledOrder.maker,
                _side,
                partiallyFilledOrder.futureValue,
                partiallyFilledOrder.amount,
                0
            );
        }
    }

    function _createPreOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) private {
        require(_amount > 0, "Invalid amount");
        uint256 activeOrderCount = FundManagementLogic.cleanUpFunds(_ccy, msg.sender);

        require(
            activeOrderCount + 1 <= ProtocolTypes.MAXIMUM_ORDER_COUNT,
            "Too many active orders"
        );

        if (!Storage.slot().usedMaturities[_ccy][msg.sender].contains(_maturity)) {
            Storage.slot().usedMaturities[_ccy][msg.sender].add(_maturity);
        }
        require(tokenVault().isCovered(msg.sender, _ccy, _amount, _side), "Not enough collateral");

        ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).createPreOrder(
            _side,
            msg.sender,
            _amount,
            _unitPrice
        );

        Storage.slot().usedCurrencies[msg.sender].add(_ccy);
    }
}
