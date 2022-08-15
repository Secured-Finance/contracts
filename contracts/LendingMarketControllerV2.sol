// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {LendingMarketV2} from "./LendingMarketV2.sol";
// interfaces
import {ILendingMarketControllerV2, Order} from "./interfaces/ILendingMarketControllerV2.sol";
import {ILendingMarketV2} from "./interfaces/ILendingMarketV2.sol";
import {IGenesisValueToken} from "./interfaces/IGenesisValueToken.sol";
// libraries
import {QuickSort} from "./libraries/QuickSort.sol";
import {DiscountFactor} from "./libraries/DiscountFactor.sol";
import {ProductPrefixes} from "./libraries/ProductPrefixes.sol";
import {BeaconContracts, Contracts} from "./libraries/Contracts.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "./libraries/BokkyPooBahsDateTimeLibrary.sol";
// mixins
import {MixinAddressResolverV2} from "./mixins/MixinAddressResolverV2.sol";
import {MixinBeaconProxyController} from "./mixins/MixinBeaconProxyController.sol";
// utils
import {Ownable} from "./utils/Ownable.sol";
import {Proxyable} from "./utils/Proxyable.sol";
// storages
import {LendingMarketControllerV2Storage as Storage} from "./storages/LendingMarketControllerV2Storage.sol";

/**
 * @dev Lending Market Controller contract is managing separated lending
 * order-book markets (per term) and responsible to calculate Discount Factors per currency
 * and construct yield curve
 *
 * It will store lending market addresses by ccy and term in lendingMarkets mapping.
 */
contract LendingMarketControllerV2 is
    ILendingMarketControllerV2,
    MixinAddressResolverV2,
    MixinBeaconProxyController,
    Ownable,
    Proxyable
{
    using QuickSort for uint256[];
    uint256 private constant BASIS_TERM = 3;

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(
        address _owner,
        address _resolver,
        uint256 _basisDate
    ) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
        Storage.slot().basisDate = _basisDate;
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
    }

    // =========== YIELD CURVE FUNCTIONS ===========

    function basisDate() external view returns (uint256) {
        return Storage.slot().basisDate;
    }

    function getLendingMarkets(bytes32 _ccy) external view returns (address[] memory) {
        return Storage.slot().lendingMarkets[_ccy];
    }

    /**
     * @dev Triggers to get borrow rates for selected currency.
     * @param _ccy Currency
     */
    function getBorrowRatesForCcy(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarketV2 market = ILendingMarketV2(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getBorrowRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get lend rates for selected currency.
     * @param _ccy Currency
     */
    function getLendRatesForCcy(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarketV2 market = ILendingMarketV2(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getLendRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get mid rates for selected currency.
     * @param _ccy Currency
     */
    function getMidRatesForCcy(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory rates = new uint256[](Storage.slot().lendingMarkets[_ccy].length);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarketV2 market = ILendingMarketV2(Storage.slot().lendingMarkets[_ccy][i]);
            rates[i] = market.getMidRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get lending market.
     * @param _ccy Currency for Lending Market
     * @param _marketNo The market number
     */
    function getLendingMarket(bytes32 _ccy, uint256 _marketNo)
        external
        view
        override
        returns (address)
    {
        return Storage.slot().lendingMarkets[_ccy][_marketNo];
    }

    function getTotalPresentValue(bytes32 ccy, address account)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[ccy].length; i++) {
            totalPresentValue += ILendingMarketV2(Storage.slot().lendingMarkets[ccy][i])
                .presentValueOf(account);
        }
    }

    // =========== MARKET DEPLOYMENT FUNCTIONS ===========
    function getLendingMarketImpl() external view returns (address) {
        return Storage.slot().lendingMarketProxy;
    }

    function getGenesisValueTokenImpl() external view returns (address) {
        return Storage.slot().genesisValueTokenProxy;
    }

    function getFutureValueTokenImpl() external view returns (address) {
        return Storage.slot().futureValueTokenProxy;
    }

    /**
     * @dev Sets the implementation contract of LendingMarket
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketImpl(address newImpl) external onlyOwner {
        Storage.slot().lendingMarketProxy = _updateBeaconImpl(
            BeaconContracts.LENDING_MARKET,
            newImpl
        );
    }

    /**
     * @dev Sets the implementation contract of GenesisValueToken
     * @param newImpl The address of implementation contract
     */
    function setGenesisValueTokenImpl(address newImpl) external onlyOwner {
        Storage.slot().genesisValueTokenProxy = _updateBeaconImpl(
            BeaconContracts.GENESIS_VALUE_TOKEN,
            newImpl
        );
    }

    /**
     * @dev Sets the implementation contract of FutureValueToken
     * @param newImpl The address of implementation contract
     */
    function setFutureValueTokenImpl(address newImpl) external onlyOwner {
        Storage.slot().futureValueTokenProxy = _updateBeaconImpl(
            BeaconContracts.FUTURE_VALUE_TOKEN,
            newImpl
        );
    }

    function deployGenesisValueToken(bytes32 _ccy, uint256 _compoundFactor) external {
        require(
            Storage.slot().genesisValueTokens[_ccy] == address(0),
            "Genesis value token has been already deployed in the currency"
        );

        Storage.slot().genesisValueTokens[_ccy] = _deployGenesisValueToken(_ccy, _compoundFactor);
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
            Storage.slot().genesisValueTokens[_ccy] != address(0),
            "Genesis value token hasn't been deployed in the currency"
        );
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");

        uint256 basisMaturity = Storage.slot().basisDate;

        if (Storage.slot().lendingMarkets[_ccy].length > 0) {
            basisMaturity = ILendingMarketV2(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
        }

        uint256 nextMaturity = TimeLibrary.addMonths(basisMaturity, BASIS_TERM);
        uint256 marketNo = Storage.slot().lendingMarkets[_ccy].length + 1;

        address fvTokenAddr = _deployFutureValueToken(_ccy, marketNo, nextMaturity);
        market = address(
            _deployLendingMarket(
                _ccy,
                marketNo,
                nextMaturity,
                Storage.slot().basisDate,
                fvTokenAddr,
                Storage.slot().genesisValueTokens[_ccy]
            )
        );

        Storage.slot().lendingMarkets[_ccy].push(market);

        emit LendingMarketCreated(_ccy, market, Storage.slot().lendingMarkets[_ccy].length);
        return market;
    }

    // =========== LENDING MARKETS MANAGEMENT FUNCTIONS ===========

    function rotateLendingMarkets(bytes32 _ccy) external {
        require(
            Storage.slot().lendingMarkets[_ccy].length > 0,
            "No lending markets exist for a specific currency"
        );

        address[] storage markets = Storage.slot().lendingMarkets[_ccy];
        address currentMarketAddr = markets[0];
        address nextMarketAddr = markets[1];

        // Rotate the order of the market
        for (uint256 i = 0; i < markets.length; i++) {
            address marketAddr = (markets.length - 1) == i ? currentMarketAddr : markets[i + 1];
            markets[i] = marketAddr;
        }

        uint256 newLastMaturity = TimeLibrary.addMonths(
            ILendingMarketV2(markets[markets.length - 1]).getMaturity(),
            BASIS_TERM
        );
        uint256 prevMaturity = ILendingMarketV2(currentMarketAddr).openMarket(newLastMaturity);

        IGenesisValueToken gvToken = IGenesisValueToken(Storage.slot().genesisValueTokens[_ccy]);
        gvToken.updateCompoundFactor(
            prevMaturity,
            ILendingMarketV2(nextMarketAddr).getMaturity(),
            ILendingMarketV2(nextMarketAddr).getMidRate()
        );

        emit LendingMarketsRotated(_ccy, prevMaturity, newLastMaturity);
    }

    /**
     * @dev Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function pauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarketV2 market = ILendingMarketV2(Storage.slot().lendingMarkets[_ccy][i]);
            market.pauseMarket();
        }

        emit LendingMarketsPaused(_ccy);
        return true;
    }

    /**
     * @dev Unpauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function unpauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            ILendingMarketV2 market = ILendingMarketV2(Storage.slot().lendingMarkets[_ccy][i]);
            market.unpauseMarket();
        }

        emit LendingMarketsUnpaused(_ccy);
        return true;
    }

    // =========== BULK TRADE FUNCTIONS ===========

    /**
     * @dev Places orders in multiple Lending Markets.
     * @param orders Lending Market orders array with ccy and terms to identify right market
     */
    function placeBulkOrders(Order[] memory orders) external override returns (bool) {
        for (uint8 i = 0; i < orders.length; i++) {
            Order memory order = orders[i];

            ILendingMarketV2 market = ILendingMarketV2(
                Storage.slot().lendingMarkets[order.ccy][order.term]
            );
            market.order(order.side, order.amount, order.rate);
        }

        return true;
    }

    function _deployLendingMarket(
        bytes32 _ccy,
        uint256 _marketNo,
        uint256 _maturity,
        uint256 _basisDate,
        address _fvToken,
        address _gvToken
    ) private returns (address) {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,bytes32,uint256,uint256,uint256,address,address)",
            address(resolver),
            _ccy,
            _marketNo,
            _maturity,
            _basisDate,
            _fvToken,
            _gvToken
        );
        return _createProxy(BeaconContracts.LENDING_MARKET, data);
    }

    function _deployGenesisValueToken(bytes32 _ccy, uint256 _compoundFactor)
        private
        returns (address)
    {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,bytes32,uint256)",
            msg.sender,
            address(resolver),
            _ccy,
            _compoundFactor
        );
        return _createProxy(BeaconContracts.GENESIS_VALUE_TOKEN, data);
    }

    function _deployFutureValueToken(
        bytes32 _ccy,
        uint256 _marketNo,
        uint256 _maturity
    ) private returns (address) {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,bytes32,uint256,uint256)",
            msg.sender,
            address(resolver),
            _ccy,
            _marketNo,
            _maturity
        );
        return _createProxy(BeaconContracts.FUTURE_VALUE_TOKEN, data);
    }
}
