// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {LendingMarket} from "./LendingMarket.sol";
// interfaces
import {ILendingMarketController, Order} from "./interfaces/ILendingMarketController.sol";
import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {IGenesisValueToken} from "./interfaces/IGenesisValueToken.sol";
// libraries
import {QuickSort} from "./libraries/QuickSort.sol";
import {BeaconContracts, Contracts} from "./libraries/Contracts.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "./libraries/BokkyPooBahsDateTimeLibrary.sol";
// mixins
import {MixinAddressResolver} from "./mixins/MixinAddressResolver.sol";
import {MixinBeaconProxyController} from "./mixins/MixinBeaconProxyController.sol";
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
    Ownable,
    Proxyable
{
    using QuickSort for uint256[];
    uint256 private constant BASIS_TERM = 3;

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address _owner, address _resolver) public initializer onlyProxy {
        _transferOwnership(_owner);
        registerAddressResolver(_resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](1);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
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
    function getMaturities(bytes32 _ccy) external view override returns (uint256[] memory) {
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
     * @param _account Target address
     */
    function getTotalPresentValue(bytes32 _ccy, address _account)
        public
        view
        override
        returns (int256 totalPresentValue)
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            totalPresentValue += ILendingMarket(Storage.slot().lendingMarkets[_ccy][i])
                .presentValueOf(_account);
        }
    }

    function getGenesisValue(bytes32 _ccy, address _account) external view returns (int256) {
        IGenesisValueToken gvToken = IGenesisValueToken(Storage.slot().genesisValueTokens[_ccy]);
        return gvToken.balanceOf(_account);
    }

    function getGenesisValueToken(bytes32 _ccy) external view returns (address) {
        return Storage.slot().genesisValueTokens[_ccy];
    }

    /**
     * @dev Gets the beacon proxy address to specified name
     * @param beaconName The cache name of the beacon proxy
     */
    function getBeaconProxyAddress(bytes32 beaconName) external view override returns (address) {
        return _getAddress(beaconName);
    }

    /**
     * @dev Sets the implementation contract of LendingMarket
     * @param newImpl The address of implementation contract
     */
    function setLendingMarketImpl(address newImpl) external override onlyOwner {
        _updateBeaconImpl(BeaconContracts.LENDING_MARKET, newImpl);
    }

    /**
     * @dev Sets the implementation contract of GenesisValueToken
     * @param newImpl The address of implementation contract
     */
    function setGenesisValueTokenImpl(address newImpl) external override onlyOwner {
        _updateBeaconImpl(BeaconContracts.GENESIS_VALUE_TOKEN, newImpl);
    }

    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _compoundFactor
    ) external override onlyOwner {
        require(_compoundFactor > 0, "Invalid compound factor");
        require(Storage.slot().basisDates[_ccy] == 0, "Already initialized");

        Storage.slot().genesisValueTokens[_ccy] = _deployGenesisValueToken(_ccy, _compoundFactor);
        Storage.slot().basisDates[_ccy] = _basisDate;
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

        uint256 basisDate = Storage.slot().basisDates[_ccy];

        if (Storage.slot().lendingMarkets[_ccy].length > 0) {
            basisDate = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
        }

        uint256 nextMaturity = TimeLibrary.addMonths(basisDate, BASIS_TERM);
        uint256 marketNo = Storage.slot().lendingMarkets[_ccy].length + 1;

        market = address(
            _deployLendingMarket(
                _ccy,
                marketNo,
                nextMaturity,
                Storage.slot().basisDates[_ccy],
                Storage.slot().genesisValueTokens[_ccy]
            )
        );

        Storage.slot().lendingMarkets[_ccy].push(market);

        emit LendingMarketCreated(_ccy, market, Storage.slot().lendingMarkets[_ccy].length);
        return market;
    }

    // =========== LENDING MARKETS MANAGEMENT FUNCTIONS ===========

    function rotateLendingMarkets(bytes32 _ccy) external override {
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
            ILendingMarket(markets[markets.length - 1]).getMaturity(),
            BASIS_TERM
        );
        uint256 prevMaturity = ILendingMarket(currentMarketAddr).openMarket(newLastMaturity);

        IGenesisValueToken gvToken = IGenesisValueToken(Storage.slot().genesisValueTokens[_ccy]);
        gvToken.updateCompoundFactor(
            prevMaturity,
            ILendingMarket(nextMarketAddr).getMaturity(),
            ILendingMarket(nextMarketAddr).getMidRate()
        );

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

        emit LendingMarketsPaused(_ccy);
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

        emit LendingMarketsUnpaused(_ccy);
        return true;
    }

    function _deployLendingMarket(
        bytes32 _ccy,
        uint256 _marketNo,
        uint256 _maturity,
        uint256 _basisDate,
        address _gvToken
    ) private returns (address) {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,bytes32,uint256,uint256,uint256,address)",
            address(resolver),
            _ccy,
            _marketNo,
            _maturity,
            _basisDate,
            _gvToken
        );
        return _createProxy(BeaconContracts.LENDING_MARKET, data);
    }

    function _deployGenesisValueToken(bytes32 _ccy, uint256 _compoundFactor)
        private
        returns (address)
    {
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address,uint8,bytes32,uint256)",
            msg.sender,
            address(resolver),
            18,
            _ccy,
            _compoundFactor
        );
        return _createProxy(BeaconContracts.GENESIS_VALUE_TOKEN, data);
    }
}
