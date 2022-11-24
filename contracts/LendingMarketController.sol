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
    uint256 private constant MAXIMUM_ORDER_COUNT = 5;

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
     * @notice Gets the total present value of the account for selected currency.
     * @param _ccy Currency name in bytes32 for Lending Market
     * @param _user User's address
     * @return totalPresentValue The total present value
     */
    function getTotalPresentValue(bytes32 _ccy, address _user)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        // Get PV from Future Value Vault
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address marketAddr = Storage.slot().lendingMarkets[_ccy][i];
            (int256 futureValueInMaturity, uint256 maturity) = IFutureValueVault(
                Storage.slot().futureValueVaults[_ccy][marketAddr]
            ).getFutureValue(_user);

            totalPresentValue += _calculatePresentValue(
                _ccy,
                maturity,
                futureValueInMaturity,
                Storage.slot().lendingMarkets[_ccy][i]
            );
        }

        // Get PV from Genesis Value Vault
        int256 amountInFV = genesisValueVault().getGenesisValueInFutureValue(_ccy, _user);
        totalPresentValue += _calculatePVFromFV(
            amountInFV,
            ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice()
        );
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
            int256 amount = getTotalPresentValue(ccy, _user);
            totalPresentValue += currencyController().convertToETH(ccy, amount);
        }
    }

    /**
     * @notice Gets the funds that are calculated from the user's lending order list for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return workingOrdersAmount The working orders amount on the order book
     * @return claimableAmount The claimable amount due to the lending orders being filled on the order book
     */
    function calculateLentFundsFromOrders(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 claimableAmount,
            uint256 lentAmount
        )
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 activeAmount,
                uint256 inactiveAmount,
                uint256 inactiveFutureValueInMaturity,
                uint256 maturity
            ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]).getTotalAmountFromLendOrders(
                        _user
                    );

            workingOrdersAmount += activeAmount;
            claimableAmount += uint256(
                _calculatePresentValue(
                    _ccy,
                    maturity,
                    int256(inactiveFutureValueInMaturity),
                    Storage.slot().lendingMarkets[_ccy][i]
                )
            );
            lentAmount += inactiveAmount;
        }
    }

    /**
     * @notice Gets the funds that are calculated from the user's borrowing order list for the selected currency.
     * @param _ccy Currency name in bytes32
     * @param _user User's address
     * @return workingOrdersAmount The working orders amount on the order book
     * @return obligationAmount The debt amount due to the borrow orders being filled on the order book
     * @return borrowedAmount The borrowed amount due to the borrow orders being filled on the order book
     */
    function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 obligationAmount,
            uint256 borrowedAmount
        )
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 activeAmount,
                uint256 inactiveAmount,
                uint256 inactiveFutureValueInMaturity,
                uint256 maturity
            ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i])
                    .getTotalAmountFromBorrowOrders(_user);

            workingOrdersAmount += activeAmount;
            obligationAmount += uint256(
                _calculatePresentValue(
                    _ccy,
                    maturity,
                    int256(inactiveFutureValueInMaturity),
                    Storage.slot().lendingMarkets[_ccy][i]
                )
            );
            borrowedAmount += inactiveAmount;
        }
    }

    function calculateTotalFundsInETH(address _user)
        external
        view
        override
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalEvaluatedClaimableAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalObligationAmount,
            uint256 totalBorrowedAmount
        )
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        // Calculate total funds from the user's order list
        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory amounts = new uint256[](7);

            // 0: workingLendOrdersAmount
            // 1: claimableAmount
            // 2: lentAmount
            // 3: workingBorrowOrdersAmount
            // 4: obligationAmount
            // 5: borrowedAmount
            // 6: evaluatedClaimableAmount
            (amounts[0], amounts[1], amounts[2]) = calculateLentFundsFromOrders(ccy, _user);
            (amounts[3], amounts[4], amounts[5]) = calculateBorrowedFundsFromOrders(ccy, _user);
            amounts[6] = amounts[1];

            // Calculate total present value from Future Value Vault and Genesis Value Vault.
            int256 totalPresentValue = getTotalPresentValue(ccy, _user);
            if (totalPresentValue >= 0) {
                // Add to claimableAmount
                amounts[1] += uint256(totalPresentValue);
                uint256 haircut = currencyController().getHaircut(ccy);
                amounts[6] += (uint256(totalPresentValue) * haircut) / ProtocolTypes.PCT_DIGIT;
            } else {
                // Add to obligationAmount
                amounts[4] += uint256(-totalPresentValue);
            }

            uint256[] memory amountsInETH = currencyController().convertToETH(ccy, amounts);

            totalWorkingLendOrdersAmount += amountsInETH[0];
            totalClaimableAmount += amountsInETH[1];
            totalLentAmount += amountsInETH[2];

            totalWorkingBorrowOrdersAmount += amountsInETH[3];
            totalObligationAmount += amountsInETH[4];
            totalBorrowedAmount += amountsInETH[5];

            totalEvaluatedClaimableAmount = amountsInETH[6];
        }
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

        genesisValueVault().registerCurrency(_ccy, 18, _compoundFactor);
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
            genesisValueVault().isRegisteredCurrency(_ccy),
            "Lending market hasn't been initialized in the currency"
        );
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");

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
        return _createOrder(_ccy, _maturity, _side, _amount, _unitPrice);
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

        return _createOrder(_ccy, _maturity, _side, _amount, _unitPrice);
    }

    /**
     * @notice Creates a lend order with ETH. Takes the order if the order is matched,
     * and places new order if not match it.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _unitPrice Amount of unit price taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createLendOrderWithETH(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _unitPrice
    ) external payable override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        return _createOrder(_ccy, _maturity, ProtocolTypes.Side.LEND, msg.value, _unitPrice);
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

        return _createOrder(_ccy, _maturity, ProtocolTypes.Side.LEND, msg.value, _unitPrice);
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
     * @notice Rotate the lending markets. In this rotation, the following actions are happened.
     * - Updates the maturity at the beginning of the market array.
     * - Moves the beginning of the market array to the end of it.
     * - Update the compound factor in this contract using the next market unit price.
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
    function cleanOrders(bytes32 _ccy, address _user) public override {
        EnumerableSet.Bytes32Set storage ccySet = Storage.slot().usedCurrencies[_user];
        if (!ccySet.contains(_ccy)) {
            return;
        }

        uint256 totalActiveOrderCount = 0;
        bool futureValueExists = false;
        uint256[] memory maturities = getMaturities(_ccy);

        for (uint256 j = 0; j < maturities.length; j++) {
            address market = Storage.slot().maturityLendingMarkets[_ccy][maturities[j]];
            int256 currentFutureValue = _convertFutureValueToGenesisValue(
                _ccy,
                maturities[j],
                Storage.slot().futureValueVaults[_ccy][market],
                _user
            );

            (uint256 activeOrderCount, bool isFilled) = _cleanOrders(_ccy, maturities[j], _user);
            totalActiveOrderCount += activeOrderCount;

            if (isFilled) {
                currentFutureValue = _convertFutureValueToGenesisValue(
                    _ccy,
                    maturities[j],
                    Storage.slot().futureValueVaults[_ccy][market],
                    _user
                );
            }

            if (currentFutureValue != 0) {
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
     * @param _futureValueVault Market contract address
     * @param _user User's address
     * @return Current future value amount after update
     */
    function _convertFutureValueToGenesisValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _futureValueVault,
        address _user
    ) private returns (int256) {
        (int256 removedAmount, int256 currentAmount, uint256 basisMaturity) = IFutureValueVault(
            _futureValueVault
        ).removeFutureValue(_user, _maturity);

        if (removedAmount != 0) {
            genesisValueVault().addGenesisValue(_ccy, _user, basisMaturity, removedAmount);
        }

        return currentAmount;
    }

    function _createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _unitPrice
    ) private returns (bool) {
        require(_amount > 0, "Invalid amount");
        require(tokenVault().isCovered(msg.sender, _ccy, _amount, _side), "Not enough collateral");

        address futureValueVault = Storage.slot().futureValueVaults[_ccy][
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ];

        _convertFutureValueToGenesisValue(_ccy, _maturity, futureValueVault, msg.sender);

        (uint256 activeOrderCount, ) = _cleanOrders(_ccy, _maturity, msg.sender);

        (uint256 filledFutureValue, uint256 remainingAmount) = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ).createOrder(_side, msg.sender, _amount, _unitPrice);

        // The case that an order was made, or taken partially
        if (filledFutureValue == 0 || remainingAmount > 0) {
            activeOrderCount += 1;
        }

        require(activeOrderCount <= MAXIMUM_ORDER_COUNT, "Too many active orders");

        if (filledFutureValue == 0) {
            emit PlaceOrder(msg.sender, _ccy, _side, _maturity, _amount, _unitPrice);
        } else {
            if (_side == ProtocolTypes.Side.BORROW) {
                tokenVault().addCollateral(msg.sender, _ccy, _amount - remainingAmount);
                IFutureValueVault(futureValueVault).addBorrowFutureValue(
                    msg.sender,
                    filledFutureValue,
                    _maturity
                );
            } else {
                tokenVault().removeCollateral(msg.sender, _ccy, _amount - remainingAmount);
                IFutureValueVault(futureValueVault).addLendFutureValue(
                    msg.sender,
                    filledFutureValue,
                    _maturity
                );
            }

            emit FillOrder(
                msg.sender,
                _ccy,
                _side,
                _maturity,
                _amount,
                _unitPrice,
                filledFutureValue
            );
        }

        Storage.slot().usedCurrencies[msg.sender].add(_ccy);

        return true;
    }

    function _cleanOrders(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) private returns (uint256 activeOrderCount, bool isFilled) {
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
            tokenVault().removeCollateral(
                _user,
                _ccy,
                removedLendOrderAmount - removedBorrowOrderAmount
            );
        } else if (removedLendOrderAmount < removedBorrowOrderAmount) {
            tokenVault().addCollateral(
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
                msg.sender,
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
                msg.sender,
                _ccy,
                ProtocolTypes.Side.BORROW,
                userCurrentMaturity,
                removedBorrowOrderFutureValue
            );
        }

        isFilled = (removedLendOrderFutureValue + removedBorrowOrderFutureValue) > 0;
        activeOrderCount = activeLendOrderCount + activeBorrowOrderCount;
    }

    function _calculatePresentValue(
        bytes32 _ccy,
        uint256 maturity,
        int256 futureValueInMaturity,
        address lendingMarketInMaturity
    ) private view returns (int256 totalPresentValue) {
        uint256 compoundFactorInMaturity = genesisValueVault()
            .getMaturityUnitPrice(_ccy, maturity)
            .compoundFactor;
        int256 futureValue;
        uint256 unitPrice;

        if (compoundFactorInMaturity == 0) {
            futureValue = futureValueInMaturity;
            unitPrice = ILendingMarket(lendingMarketInMaturity).getMidUnitPrice();
        } else {
            int256 genesisValue = genesisValueVault().calculateGVFromFV(
                _ccy,
                maturity,
                futureValueInMaturity
            );
            futureValue = genesisValueVault().calculateFVFromGV(_ccy, 0, genesisValue);
            unitPrice = ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice();
        }

        return _calculatePVFromFV(futureValue, unitPrice);
    }

    function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice)
        internal
        pure
        returns (int256)
    {
        // NOTE: The formula is: futureValue = presentValue / unitPrice.
        return (_futureValue * int256(_unitPrice)) / int256(ProtocolTypes.PRICE_DIGIT);
    }
}
