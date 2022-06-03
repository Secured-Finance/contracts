// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/QuickSort.sol";
import "./libraries/DiscountFactor.sol";
import "./LendingMarket.sol";
import "./interfaces/ILendingMarketController.sol";
import "./interfaces/ILendingMarket.sol";
import "./mixins/MixinAddressResolver.sol";

/**
 * @dev Lending Market Controller contract is managing separated lending
 * order-book markets (per term) and responsible to calculate Discount Factors per currency
 * and construct yield curve
 *
 * It will store lending market addresses by ccy and term in lendingMarkets mapping.
 */
contract LendingMarketController is ILendingMarketController, MixinAddressResolver, Ownable {
    using QuickSort for uint256[];

    bytes4 constant prefix = 0x21aaa47b;
    uint256 public override numberOfMarkets = 0;

    mapping(bytes32 => mapping(uint256 => address)) public override lendingMarkets;
    mapping(bytes32 => uint256[]) public supportedTerms;

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) Ownable() {}

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = CONTRACT_CURRENCY_CONTROLLER;
        contracts[1] = CONTRACT_TERM_STRUCTURE;
    }

    // =========== YIELD CURVE FUNCTIONS ===========

    /**
     * @dev Triggers to get borrow rates for selected currency.
     * @param _ccy Currency
     */
    function getBorrowRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            rates[i] = market.getBorrowRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get lend rates for selected currency.
     * @param _ccy Currency
     */
    function getLendRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            rates[i] = market.getLendRate();
        }

        return rates;
    }

    /**
     * @dev Triggers to get mid rates for selected currency.
     * @param _ccy Currency
     */
    function getMidRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            rates[i] = market.getMidRate();
        }

        return rates;
    }

    // =========== DISCOUNT FACTORS CALCULATION ===========

    function getDiscountFactorsForCcy(bytes32 _ccy)
        public
        view
        override
        returns (uint256[] memory, uint256[] memory)
    {
        uint256[] memory rates = getMidRatesForCcy(_ccy);
        return DiscountFactor.calculateDFs(rates, supportedTerms[_ccy]);
    }

    function getSupportedTerms(bytes32 _ccy) public view override returns (uint256[] memory) {
        return supportedTerms[_ccy];
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
        public
        override
        onlyOwner
        returns (address market)
    {
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");
        require(termStructure().isSupportedTerm(_term, prefix, _ccy), "NON SUPPORTED TERM");
        require(lendingMarkets[_ccy][_term] == address(0), "Couldn't rewrite existing market");
        market = address(new LendingMarket(address(resolver), _ccy, _term));
        lendingMarkets[_ccy][_term] = market;

        supportedTerms[_ccy].push(_term);
        supportedTerms[_ccy] = supportedTerms[_ccy].sort();

        emit LendingMarketCreated(_ccy, _term, market);
        return market;
    }

    // =========== LENDING MARKETS MANAGEMENT FUNCTIONS ===========

    /**
     * @dev Pauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function pauseLendingMarkets(bytes32 _ccy) public override onlyOwner returns (bool) {
        uint256[] memory terms = supportedTerms[_ccy];

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            market.pauseMarket();
        }

        emit LendingMarketsPaused(_ccy);
        return true;
    }

    /**
     * @dev Unpauses previously deployed lending market by currency
     * @param _ccy Currency for pausing all lending markets
     */
    function unpauseLendingMarkets(bytes32 _ccy) public override onlyOwner returns (bool) {
        uint256[] memory terms = supportedTerms[_ccy];

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
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
    function placeBulkOrders(Order[] memory orders) public override returns (bool) {
        for (uint8 i = 0; i < orders.length; i++) {
            Order memory order = orders[i];

            ILendingMarket market = ILendingMarket(lendingMarkets[order.ccy][order.term]);
            market.order(order.side, order.amount, order.rate);
        }

        return true;
    }
}
