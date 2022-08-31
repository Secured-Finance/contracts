// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarketController, Order} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
// libraries
import {BeaconContracts, Contracts} from "./libraries/Contracts.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "./libraries/BokkyPooBahsDateTimeLibrary.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinBeaconProxyController} from "./mixins/MixinBeaconProxyController.sol";
import {MixinGenesisValue} from "./mixins/MixinGenesisValue.sol";
// types
import {ProtocolTypes} from "./types/ProtocolTypes.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "./storages/LendingMarketControllerStorage.sol";

/**
 * @notice Implements the module to manage separated lending order-book markets per maturity
 * and provides the calculation module of the Genesis value per currency  by inheriting `MixinGenesisValue.sol`.
 *
 * This is the main contract called by users creating orders to lend or borrow funds.
 */
contract LendingMarketController is
    ILendingMarketController,
    MixinAddressResolver,
    MixinBeaconProxyController,
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
        contracts = new bytes32[](2);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
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
            totalPresentValue += ILendingMarket(marketAddr).presentValueOf(_account);
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

    /**
     * @notice Gets the beacon proxy address to the selected name.
     * @param beaconName The cache name of the beacon proxy
     * @return totalPresentValue The beacon proxy address
     */
    function getBeaconProxyAddress(bytes32 beaconName) external view override returns (address) {
        return _getAddress(beaconName);
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
     * @notice Sets the implementation contract of LendingMarket
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketImpl(address newImpl) external override onlyOwner {
        _updateBeaconImpl(BeaconContracts.LENDING_MARKET, newImpl);
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
        returns (address market)
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

        market = address(_deployLendingMarket(_ccy, nextMaturity, Storage.slot().basisDates[_ccy]));

        Storage.slot().lendingMarkets[_ccy].push(market);
        Storage.slot().maturityLendingMarkets[_ccy][nextMaturity] = market;

        emit LendingMarketCreated(
            _ccy,
            market,
            Storage.slot().lendingMarkets[_ccy].length,
            nextMaturity
        );
        return market;
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
    ) external nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        address marketAddr = Storage.slot().maturityLendingMarkets[_ccy][_maturity];

        _convertFutureValueToGenesisValue(_ccy, marketAddr, msg.sender);

        // Create a order
        (address maker, uint256 matchedAmount) = ILendingMarket(marketAddr).createOrder(
            _side,
            msg.sender,
            _amount,
            _rate
        );

        // Update the unsettled collateral in CollateralAggregator
        uint256 settledCollateralAmount = (_amount * ProtocolTypes.MKTMAKELEVEL) /
            ProtocolTypes.PCT;
        if (matchedAmount == 0) {
            collateralAggregator().useUnsettledCollateral(maker, _ccy, settledCollateralAmount);
        } else {
            collateralAggregator().releaseUnsettledCollateral(maker, _ccy, settledCollateralAmount);
            Storage.slot().usedCurrencies[msg.sender].add(_ccy);
            Storage.slot().usedCurrencies[maker].add(_ccy);
        }

        return true;
    }

    /**
     * @notice Gets if the market order will be matched or not.
     * @param _ccy Currency name in bytes32 of the selected market
     * @param _maturity The maturity of the selected market
     * @param _side Order position type, Borrow or Lend
     * @param _amount Amount of funds the maker wants to borrow/lend
     * @param _rate Amount of interest rate taker wish to borrow/lend
     * @return True if the execution of the operation succeeds
     */
    function matchOrders(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external view ifValidMaturity(_ccy, _maturity) returns (bool) {
        address marketAddr = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        ILendingMarket(marketAddr).matchOrders(_side, _amount, _rate);

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
        uint256 _orderId
    ) external nonReentrant ifValidMaturity(_ccy, _maturity) returns (bool) {
        address marketAddr = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        uint256 amount = ILendingMarket(marketAddr).cancelOrder(msg.sender, _orderId);

        collateralAggregator().releaseUnsettledCollateral(
            msg.sender,
            _ccy,
            (amount * ProtocolTypes.MKTMAKELEVEL) / ProtocolTypes.PCT
        );

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

        emit LendingMarketsRotated(_ccy, prevMaturity, newLastMaturity);
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
     * @param _user User's address
     */
    function convertFutureValueToGenesisValue(address _user) external nonReentrant {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory maturities = getMaturities(ccy);

            for (uint256 j = 0; j < maturities.length; j++) {
                address marketAddr = Storage.slot().maturityLendingMarkets[ccy][maturities[j]];
                _convertFutureValueToGenesisValue(ccy, marketAddr, _user);
            }
            if (getGenesisValue(ccy, _user) == 0) {
                Storage.slot().usedCurrencies[_user].remove(ccy);
            }
        }
    }

    /**
     * @notice Converts the future value to the genesis value if there is balance in the past maturity.
     * @param _ccy Currency for pausing all lending markets
     * @param _marketAddr Market contract address
     * @param _user User's address
     */
    function _convertFutureValueToGenesisValue(
        bytes32 _ccy,
        address _marketAddr,
        address _user
    ) private {
        (int256 removedAmount, uint256 basisMaturity) = ILendingMarket(_marketAddr)
            .removeFutureValueInPastMaturity(_user);

        if (removedAmount != 0) {
            _addGenesisValue(_ccy, _user, basisMaturity, removedAmount);
        }
    }

    /**
     * @notice Deploys the lending market contract.
     * @param _ccy Currency name in bytes32
     * @param _maturity The maturity of the market
     * @param _basisDate The basis date
     * @return The proxy contract address of created lending market
     */
    function _deployLendingMarket(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _basisDate
    ) private returns (address) {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,bytes32,uint256,uint256)",
            address(resolver),
            _ccy,
            _maturity,
            _basisDate
        );
        return _createProxy(BeaconContracts.LENDING_MARKET, data);
    }
}
