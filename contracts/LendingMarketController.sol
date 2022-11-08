// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarketController, Order} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "./interfaces/IFutureValueVault.sol";
// libraries
import {Contracts} from "./libraries/Contracts.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "./libraries/BokkyPooBahsDateTimeLibrary.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinGenesisValue} from "./mixins/MixinGenesisValue.sol";
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
    MixinGenesisValue,
    ReentrancyGuard,
    Ownable,
    Proxyable
{
    using EnumerableSet for EnumerableSet.Bytes32Set;
    uint256 private constant BASIS_TERM = 3;

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
        contracts = new bytes32[](3);
        contracts[0] = Contracts.BEACON_PROXY_CONTROLLER;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
        contracts[2] = Contracts.TOKEN_VAULT;
    }

    // @inheritdoc MixinAddressResolver
    function acceptedContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.TOKEN_VAULT;
    }

    /**
     * @notice Gets the basis date when the first market opens for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return The basis date
     */
    function getBasisDate(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().basisDates[_ccy];
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
        external
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
     * @notice Gets borrow rates for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the borrowing rate of the lending market
     */
    function getBorrowRates(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getBorrowRate();
        }

        return rates;
    }

    /**
     * @notice Gets lend rates for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the lending rate of the lending market
     */
    function getLendRates(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getLendRate();
        }

        return rates;
    }

    /**
     * @notice Gets the order book of borrow.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     * @param _limit Max limit to get rates
     * @return rates The array of borrow order rates
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
            uint256[] memory rates,
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
     * @param _limit Max limit to get rates
     * @return rates The array of lend order rates
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
            uint256[] memory rates,
            uint256[] memory amounts,
            uint256[] memory quantities
        )
    {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        return ILendingMarket(market).getLendOrderBook(_limit);
    }

    /**
     * @notice Gets mid rates for the selected currency.
     * @param _ccy Currency name in bytes32
     * @return Array with the mid rate of the lending market
     */
    function getMidRates(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getMidRate();
        }

        return rates;
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
     * @param _account Target account address
     * @return totalPresentValue The total present value
     */
    function getTotalPresentValue(bytes32 _ccy, address _account)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address marketAddr = Storage.slot().lendingMarkets[_ccy][i];
            address futureValueVault = Storage.slot().futureValueVaults[_ccy][marketAddr];
            totalPresentValue += IFutureValueVault(futureValueVault).getPresentValue(
                _account,
                ILendingMarket(marketAddr).getMidRate()
            );
        }
    }

    /**
     * @notice Gets the total present value of the account converted to ETH.
     * @param _account Target account address
     * @return totalPresentValue The total present value in ETH
     */
    function getTotalPresentValueInETH(address _account)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_account];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            int256 amount = getTotalPresentValue(ccy, _account);
            totalPresentValue += currencyController().convertToETH(ccy, amount);
        }
    }

    function calculateLentFundsFromOrders(bytes32 _ccy, address _account)
        public
        view
        returns (uint256 workingOrdersAmount, uint256 claimableAmount)
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 activeAmount,
                uint256 inactiveFutureValueInMaturity,
                uint256 maturity
            ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]).getTotalAmountFromLendOrders(
                    _account
                );

            workingOrdersAmount += activeAmount;
            // TODO: Need to convert to present value?
            claimableAmount = _calculateFutureValueInMaturity(
                _ccy,
                maturity,
                inactiveFutureValueInMaturity
            );
        }

        int256 futureValue = getGenesisValueInFutureValue(_ccy, _account);
        if (futureValue > 0) {
            claimableAmount += uint256(futureValue);
        }
    }

    function calculateTotalLentFundsInETH(address _account)
        external
        view
        override
        returns (uint256 totalWorkingOrdersAmount, uint256 totalClaimableAmount)
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().exposedCurrencies[_account];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory amounts = new uint256[](2);
            (amounts[0], amounts[1]) = calculateLentFundsFromOrders(ccy, _account);
            uint256[] memory amountsInETH = currencyController().convertToETH(ccy, amounts);

            totalWorkingOrdersAmount += amountsInETH[0];
            totalClaimableAmount += amountsInETH[1];
        }
    }

    function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _account)
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
                    .getTotalAmountFromBorrowOrders(_account);

            workingOrdersAmount += activeAmount;
            // TODO: Need to convert to present value?
            obligationAmount = _calculateFutureValueInMaturity(
                _ccy,
                maturity,
                inactiveFutureValueInMaturity
            );
            borrowedAmount = inactiveAmount;
        }

        int256 futureValue = getGenesisValueInFutureValue(_ccy, _account);
        if (futureValue < 0) {
            obligationAmount += uint256(-futureValue);
        }
    }

    /**
     * @notice Gets the funds that is calculated in EHT from account's order list.
     * @param _account Target account address
     * @return totalWorkingOrdersAmount The total working orders amount on the order book
     * @return totalObligationAmount The total debt amount due to the borrow orders being filled on the order book
     * @return totalBorrowedAmount The total borrowed amount due to the borrow orders being filled on the order book
     */
    function calculateTotalBorrowedFundsInETH(address _account)
        external
        view
        override
        returns (
            uint256 totalWorkingOrdersAmount,
            uint256 totalObligationAmount,
            uint256 totalBorrowedAmount
        )
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().exposedCurrencies[_account];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory amounts = new uint256[](3);
            (amounts[0], amounts[1], amounts[2]) = calculateBorrowedFundsFromOrders(ccy, _account);
            uint256[] memory amountsInETH = currencyController().convertToETH(ccy, amounts);

            totalWorkingOrdersAmount += amountsInETH[0];
            totalObligationAmount += amountsInETH[1];
            totalBorrowedAmount += amountsInETH[2];
        }
    }

    /**
     * @notice Gets if the lending market is initialized.
     * @param _ccy Currency name in bytes32
     * @return The boolean if the lending market is initialized or not
     */
    function isInitializedLendingMarket(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().basisDates[_ccy] != 0;
    }

    /**
     * @notice Initialize the lending market to set a basis date and compound factor
     * @param _ccy Currency name in bytes32
     * @param _basisDate The basis date when the initial market is opened
     * @param _compoundFactor The initial compound factor when the initial market is opened
     */
    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _compoundFactor
    ) external override onlyOwner {
        require(_compoundFactor > 0, "Invalid compound factor");
        require(!isInitializedLendingMarket(_ccy), "Already initialized");

        _registerCurrency(_ccy, 18, _compoundFactor);
        Storage.slot().basisDates[_ccy] = _basisDate;
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
        returns (address market, address futureValue)
    {
        require(
            isRegisteredCurrency(_ccy),
            "Lending market hasn't been initialized in the currency"
        );
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");

        uint256 basisDate = Storage.slot().basisDates[_ccy];

        if (Storage.slot().lendingMarkets[_ccy].length > 0) {
            basisDate = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
        }

        uint256 nextMaturity = TimeLibrary.addMonths(basisDate, BASIS_TERM);

        market = beaconProxyController().deployLendingMarket(
            _ccy,
            Storage.slot().basisDates[_ccy],
            nextMaturity
        );
        futureValue = beaconProxyController().deployFutureValue(address(this));

        Storage.slot().lendingMarkets[_ccy].push(market);
        Storage.slot().maturityLendingMarkets[_ccy][nextMaturity] = market;
        Storage.slot().futureValueVaults[_ccy][market] = futureValue;

        emit CreateLendingMarket(
            _ccy,
            market,
            futureValue,
            Storage.slot().lendingMarkets[_ccy].length,
            nextMaturity
        );
    }

    /**
     * @notice Creates the order. Takes the order if the order is matched,
     * and places new order if not match it.
     *
     * In addition, converts the future value to the genesis value if there is future value in past maturity
     * before the execution of order creation.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        return _createOrder(_ccy, _maturity, _side, _amount, _rate);
    }

    /**
     * @notice Creates the lend order with ETH. Takes the order if the order is matched,
     * and places new order if not match it.
     *
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function createLendOrderWithETH(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _rate
    ) external payable override nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        return _createOrder(_ccy, _maturity, ProtocolTypes.Side.LEND, msg.value, _rate);
    }

    // /**
    //  * @notice Gets if the market order will be matched or not.
    //  * @param _ccy Currency name in bytes32 of the selected market
    //  * @param _maturity The maturity of the selected market
    //  * @param _side Order position type, Borrow or Lend
    //  * @param _amount Amount of funds the maker wants to borrow/lend
    //  * @param _rate Amount of interest rate taker wish to borrow/lend
    //  * @return True if the execution of the operation succeeds
    //  */
    // function matchOrders(
    //     bytes32 _ccy,
    //     uint256 _maturity,
    //     ProtocolTypes.Side _side,
    //     uint256 _amount,
    //     uint256 _rate
    // ) external view override ifValidMaturity(_ccy, _maturity) returns (bool) {
    //     address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
    //     ILendingMarket(market).matchOrders(_side, _amount, _rate);

    //     return true;
    // }

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
        (ProtocolTypes.Side side, uint256 amount, uint256 rate) = ILendingMarket(market)
            .cancelOrder(msg.sender, _orderId);

        if (side == ProtocolTypes.Side.LEND) {
            tokenVault().withdrawEscrow(msg.sender, _ccy, amount);
        } else {
            // tokenVault().releaseUnsettledCollateral(msg.sender, address(0), _ccy, amount);
        }

        emit CancelOrder(_orderId, msg.sender, _ccy, side, _maturity, amount, rate);

        return true;
    }

    /**
     * @notice Rotate the lending markets. In this rotation, the following actions are happened.
     * - Updates the maturity at the beginning of the market array.
     * - Moves the beginning of the market array to the end of it.
     * - Update the compound factor in this contract using the next market rate.
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

        _updateCompoundFactor(
            _ccy,
            prevMaturity,
            ILendingMarket(nextMarketAddr).getMaturity(),
            ILendingMarket(nextMarketAddr).getMidRate()
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
     * @param _ccy Currency for pausing all lending markets
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
     * @notice Converts FutureValue to GenesisValue if there is balance in the past maturity.
     * @param _account Target account address
     */
    function convertFutureValueToGenesisValue(address _account) external override nonReentrant {
        EnumerableSet.Bytes32Set storage usedCcySet = Storage.slot().usedCurrencies[_account];
        // EnumerableSet.Bytes32Set storage exposedCcySet = Storage.slot().exposedCurrencies[_account];

        // for (uint256 i = 0; i < exposedCcySet.length(); i++) {
        //     cleanOrders(exposedCcySet.at(i), _account);
        // }

        for (uint256 i = 0; i < usedCcySet.length(); i++) {
            bytes32 ccy = usedCcySet.at(i);
            uint256[] memory maturities = getMaturities(ccy);

            for (uint256 j = 0; j < maturities.length; j++) {
                address market = Storage.slot().maturityLendingMarkets[ccy][maturities[j]];

                _convertFutureValueToGenesisValue(
                    ccy,
                    maturities[j],
                    Storage.slot().futureValueVaults[ccy][market],
                    _account
                );
            }
            if (getGenesisValue(ccy, _account) == 0) {
                Storage.slot().usedCurrencies[_account].remove(ccy);
            }
        }
    }

    /**
     * @notice Cleans own orders to remove order ids that is already filled.
     * @param _account Target account address
     */
    // function cleanOrders(bytes32 _ccy, address _account) public override {
    function cleanOrders(address _account) public override {
        EnumerableSet.Bytes32Set storage exposedCcySet = Storage.slot().exposedCurrencies[_account];

        for (uint256 i = 0; i < exposedCcySet.length(); i++) {
            uint256[] memory maturities = getMaturities(exposedCcySet.at(i));
            uint256 activeOrderCount = 0;

            for (uint256 j = 0; j < maturities.length; j++) {
                // if (Storage.slot().activeOrderExistences[_account][_ccy][maturities[i]]) {
                activeOrderCount += _cleanOrders(exposedCcySet.at(i), maturities[j], _account);
                // }
            }

            if (activeOrderCount == 0) {
                Storage.slot().exposedCurrencies[_account].remove(exposedCcySet.at(i));
            }
        }
    }

    /**
     * @notice Converts the future value to the genesis value if there is balance in the past maturity.
     * @param _ccy Currency for pausing all lending markets
     * @param _futureValueVault Market contract address
     * @param _account Target account address
     */
    function _convertFutureValueToGenesisValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _futureValueVault,
        address _account
    ) private {
        (int256 removedAmount, uint256 basisMaturity) = IFutureValueVault(_futureValueVault)
            .removeFutureValue(_account, _maturity);

        if (removedAmount != 0) {
            _addGenesisValue(_ccy, _account, basisMaturity, removedAmount);
        }
    }

    function _createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) private returns (bool) {
        require(tokenVault().isCovered(msg.sender, _ccy, _amount), "Not enough collateral");

        address futureValueVault = Storage.slot().futureValueVaults[_ccy][
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ];

        _convertFutureValueToGenesisValue(_ccy, _maturity, futureValueVault, msg.sender);

        uint256 activeOrderCount = _cleanOrders(_ccy, _maturity, msg.sender);

        (uint256 filledFutureValue, uint256 remainingAmount) = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ).createOrder(_side, msg.sender, _amount, _rate);

        // The case that an order was made, or taken partially
        if (filledFutureValue == 0 || remainingAmount > 0) {
            activeOrderCount += 1;
        }

        require(activeOrderCount <= 5, "Too many active orders");

        _updateExposedCurrency(_ccy, _maturity, msg.sender, activeOrderCount);

        if (filledFutureValue == 0) {
            emit PlaceOrder(msg.sender, _ccy, _side, _maturity, _amount, _rate);
        } else {
            if (_side == ProtocolTypes.Side.BORROW) {
                tokenVault().withdrawEscrow(msg.sender, _ccy, _amount - remainingAmount);
                IFutureValueVault(futureValueVault).addBorrowFutureValue(
                    msg.sender,
                    filledFutureValue,
                    _maturity
                );
            } else {
                IFutureValueVault(futureValueVault).addLendFutureValue(
                    msg.sender,
                    filledFutureValue,
                    _maturity
                );
            }

            // if (_side == ProtocolTypes.Side.LEND) {
            //     tokenVault().releaseUnsettledCollaterals(makers, msg.sender, _ccy, amounts);
            // } else {
            //     tokenVault().removeEscrowedAmounts(makers, msg.sender, _ccy, amounts);
            // }

            // for (uint256 i = 0; i < makers.length; i++) {
            //     Storage.slot().usedCurrencies[makers[i]].add(_ccy);
            // }

            // Storage.slot().usedCurrencies[msg.sender].add(_ccy);

            emit FillOrder(msg.sender, _ccy, _side, _maturity, _amount, _rate, filledFutureValue);
        }

        Storage.slot().usedCurrencies[msg.sender].add(_ccy);

        // If the first value of the amount array is 0, it means that the order will not be filled.
        // `remainingAmount` has a value only if the order is filled.
        uint256 placedAmount = filledFutureValue == 0 ? _amount : remainingAmount;

        if (placedAmount != 0 && _side == ProtocolTypes.Side.LEND) {
            tokenVault().depositEscrow{value: msg.value}(msg.sender, _ccy, placedAmount);
        }

        // if (placedAmount != 0) {
        //     address maker = amounts[0] == 0 ? makers[0] : msg.sender;
        //     if (_side == ProtocolTypes.Side.LEND) {
        //         tokenVault().addEscrowedAmount{value: msg.value}(maker, _ccy, placedAmount);
        //     } else {
        //         tokenVault().useUnsettledCollateral(maker, _ccy, placedAmount);
        //     }
        // }

        return true;
    }

    function _cleanOrders(
        bytes32 _ccy,
        uint256 _maturity,
        address _account
    ) private returns (uint256) {
        (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 userCurrentMaturity
        ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).cleanOrders(
                _account
            );

        if (removedLendOrderFutureValue > 0) {
            address futureValueVault = Storage.slot().futureValueVaults[_ccy][
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ];
            IFutureValueVault(futureValueVault).addLendFutureValue(
                _account,
                removedLendOrderFutureValue,
                userCurrentMaturity
            );
            emit FillOrders(
                msg.sender,
                _ccy,
                ProtocolTypes.Side.LEND,
                userCurrentMaturity,
                removedLendOrderFutureValue
            );
        }

        if (removedBorrowOrderFutureValue > 0) {
            address futureValueVault = Storage.slot().futureValueVaults[_ccy][
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ];
            IFutureValueVault(futureValueVault).addBorrowFutureValue(
                _account,
                removedBorrowOrderFutureValue,
                userCurrentMaturity
            );
            emit FillOrders(
                msg.sender,
                _ccy,
                ProtocolTypes.Side.BORROW,
                userCurrentMaturity,
                removedBorrowOrderFutureValue
            );
        }

        return activeLendOrderCount + activeBorrowOrderCount;
    }

    function _updateExposedCurrency(
        bytes32 _ccy,
        uint256 _maturity,
        address _account,
        uint256 _activeOrderCount
    ) private {
        bool activeOrderExistence = _activeOrderCount > 0;
        Storage.slot().activeOrderExistences[_account][_ccy][_maturity] = activeOrderExistence;

        if (!activeOrderExistence) {
            uint256[] memory maturities = getMaturities(_ccy);
            for (uint256 i = 0; i < maturities.length; i++) {
                if (Storage.slot().activeOrderExistences[_account][_ccy][maturities[i]]) {
                    activeOrderExistence = true;
                    break;
                }
            }
        }

        if (activeOrderExistence) {
            Storage.slot().exposedCurrencies[_account].add(_ccy);
        } else {
            Storage.slot().exposedCurrencies[_account].remove(_ccy);
        }
    }
}
