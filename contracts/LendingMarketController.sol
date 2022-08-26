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
 * @dev Lending Market Controller contract is managing separated lending
 * order-book markets (per term) and responsible to calculate Discount Factors per currency
 * and construct yield curve
 *
 * It will store lending market addresses by ccy and term in lendingMarkets mapping.
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
     * @dev Modifier to check if the currency has a lending market.
     */
    modifier hasLendingMarket(bytes32 _ccy) {
        require(
            Storage.slot().lendingMarkets[_ccy].length > 0,
            "No lending markets exist for a specific currency"
        );
        _;
    }

    /**
     * @dev Modifier to check if the maturity is valid.
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
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address _owner, address _resolver) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.COLLATERAL_AGGREGATOR;
        contracts[1] = Contracts.CURRENCY_CONTROLLER;
    }

    /**
     * @dev Gets the basis data for selected currency.
     * @param _ccy Currency
     */
    function getBasisDate(bytes32 _ccy) external view override returns (uint256) {
        return Storage.slot().basisDates[_ccy];
    }

    /**
     * @dev Gets lending market contract addresses for selected currency.
     * @param _ccy Currency
     */
    function getLendingMarkets(bytes32 _ccy) external view override returns (address[] memory) {
        return Storage.slot().lendingMarkets[_ccy];
    }

    /**
     * @dev Gets borrow rates for selected currency.
     * @param _ccy Currency
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
     * @dev Gets lend rates for selected currency.
     * @param _ccy Currency
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
     * @dev Gets mid rates for selected currency.
     * @param _ccy Currency
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
     * @dev Gets maturities for selected currency.
     * @param _ccy Currency
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
     * @dev Gets the total present value of the account for selected currency
     * @param _ccy Currency for Lending Market
     * @param _account Target account address
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
     * @dev Gets the total present value of the account converted to ETH
     * @param _account Target account address
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
     * @dev Gets the beacon proxy address to specified name
     * @param beaconName The cache name of the beacon proxy
     */
    function getBeaconProxyAddress(bytes32 beaconName) external view override returns (address) {
        return _getAddress(beaconName);
    }

    /**
     * @dev Get is the lending market is initialized
     * @param _ccy Currency
     */

    function isInitializedLendingMarket(bytes32 _ccy) public view override returns (bool) {
        return Storage.slot().basisDates[_ccy] != 0;
    }

    /**
     * @dev Initialize the lending market to set a basis data and compound factor
     * @param _ccy Currency
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
     * @dev Sets the implementation contract of LendingMarket
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketImpl(address newImpl) external override onlyOwner {
        _updateBeaconImpl(BeaconContracts.LENDING_MARKET, newImpl);
    }

    /**
     * @dev Deploys new Lending Market and save address at lendingMarkets mapping.
     * @param _ccy Main currency for new lending market
     *
     * @notice Reverts on deployment market with existing currency and term
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

    // =========== LENDING MARKETS MANAGEMENT FUNCTIONS ===========

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
     * @dev Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function pauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            market.pauseMarket();
        }

        return true;
    }

    /**
     * @dev Unpauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function unpauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]);
            market.unpauseMarket();
        }

        return true;
    }

    /**
     * @dev Convert FutureValue to GenesisValue if there is balance in the past maturity.
     * @param _account Target account address
     */
    function convertFutureValueToGenesisValue(address _account) external nonReentrant {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_account];

        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory maturities = getMaturities(ccy);

            for (uint256 j = 0; j < maturities.length; j++) {
                address marketAddr = Storage.slot().maturityLendingMarkets[ccy][maturities[j]];
                _convertFutureValueToGenesisValue(ccy, marketAddr, _account);
            }
            if (getGenesisValue(ccy, _account) == 0) {
                Storage.slot().usedCurrencies[_account].remove(ccy);
            }
        }
    }

    /**
     * @dev Convert FutureValue to GenesisValue if there is balance in the past maturity.
     * @param _ccy Currency for pausing all lending markets
     * @param _marketAddr Market contract address
     * @param _account Target account address
     */
    function _convertFutureValueToGenesisValue(
        bytes32 _ccy,
        address _marketAddr,
        address _account
    ) private {
        (int256 removedAmount, uint256 basisMaturity) = ILendingMarket(_marketAddr)
            .removeFutureValueInPastMaturity(_account);

        if (removedAmount != 0) {
            _addGenesisValue(_ccy, _account, basisMaturity, removedAmount);
        }
    }

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
