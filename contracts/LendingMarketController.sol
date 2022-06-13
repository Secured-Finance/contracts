// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./libraries/QuickSort.sol";
import "./libraries/DiscountFactor.sol";
import "./LendingMarket.sol";
import "./interfaces/ILendingMarketController.sol";
import "./interfaces/ILendingMarket.sol";
import "./mixins/MixinAddressResolver.sol";
import "./utils/Ownable.sol";
import "./utils/Proxyable.sol";
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
    Ownable,
    Proxyable
{
    using QuickSort for uint256[];
    bytes4 constant prefix = 0x21aaa47b;

    /**
     * @notice Initializes the contract.
     * @dev Function is invoked by the proxy contract when the contract is added to the ProxyController
     */
    function initialize(address owner, address resolver) public initializer onlyProxy {
        _transferOwnership(owner);
        registerAddressResolver(resolver);
    }

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.TERM_STRUCTURE;
    }

    // =========== YIELD CURVE FUNCTIONS ===========

    /**
     * @dev Triggers to get borrow rates for selected currency.
     * @param _ccy Currency
     */
    function getBorrowRatesForCcy(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory terms = Storage.slot().supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][term]);
            rates[i] = market.getBorrowRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get lend rates for selected currency.
     * @param _ccy Currency
     */
    function getLendRatesForCcy(bytes32 _ccy) external view override returns (uint256[] memory) {
        uint256[] memory terms = Storage.slot().supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][term]);
            rates[i] = market.getLendRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get mid rates for selected currency.
     * @param _ccy Currency
     */
    function getMidRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = Storage.slot().supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][term]);
            rates[i] = market.getMidRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get lending market.
     * @param _ccy Currency for Lending Market
     * @param _term Term for Lending Market
     */
    function getLendingMarket(bytes32 _ccy, uint256 _term)
        external
        view
        override
        returns (address)
    {
        return Storage.slot().lendingMarkets[_ccy][_term];
    }

    // =========== DISCOUNT FACTORS CALCULATION ===========

    /**
     * @dev Triggers to discount factor for selected currency.
     * @param _ccy Currency
     */
    function getDiscountFactorsForCcy(bytes32 _ccy)
        external
        view
        override
        returns (uint256[] memory, uint256[] memory)
    {
        uint256[] memory rates = getMidRatesForCcy(_ccy);
        return DiscountFactor.calculateDFs(rates, Storage.slot().supportedTerms[_ccy]);
    }

    /**
     * @dev Triggers to supported terms for selected currency.
     * @param _ccy Currency
     */
    function getSupportedTerms(bytes32 _ccy) external view override returns (uint256[] memory) {
        return Storage.slot().supportedTerms[_ccy];
    }

    // =========== MARKET DEPLOYMENT FUNCTIONS ===========

    /**
     * @dev Deploys new Lending Market and save address at lendingMarkets mapping.
     * @param _ccy Main currency for new lending market
     * @param _term Term for new Lending Market
     *
     * @notice Reverts on deployment market with existing currency and term
     */
    function deployLendingMarket(bytes32 _ccy, uint256 _term)
        external
        override
        onlyOwner
        returns (address market)
    {
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");
        require(termStructure().isSupportedTerm(_term, prefix, _ccy), "NON SUPPORTED TERM");
        require(
            Storage.slot().lendingMarkets[_ccy][_term] == address(0),
            "Couldn't rewrite existing market"
        );
        market = address(new LendingMarket(address(resolver), _ccy, _term));
        Storage.slot().lendingMarkets[_ccy][_term] = market;

        Storage.slot().supportedTerms[_ccy].push(_term);
        Storage.slot().supportedTerms[_ccy] = Storage.slot().supportedTerms[_ccy].sort();

        emit LendingMarketCreated(_ccy, _term, market);
        return market;
    }

    // =========== LENDING MARKETS MANAGEMENT FUNCTIONS ===========

    /**
     * @dev Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function pauseLendingMarkets(bytes32 _ccy) external override onlyOwner returns (bool) {
        uint256[] memory terms = Storage.slot().supportedTerms[_ccy];

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][term]);
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
        uint256[] memory terms = Storage.slot().supportedTerms[_ccy];

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy][term]);
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

            ILendingMarket market = ILendingMarket(
                Storage.slot().lendingMarkets[order.ccy][order.term]
            );
            market.order(order.side, order.amount, order.rate);
        }

        return true;
    }
}
