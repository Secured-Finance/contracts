// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./libraries/QuickSort.sol";
import "./ProtocolTypes.sol";
import "./LendingMarket.sol";
import './interfaces/ILendingMarketController.sol';
import './interfaces/ILendingMarket.sol';
import './interfaces/IDiscountFactors.sol';
import './interfaces/ICurrencyController.sol';
import './interfaces/ITermStructure.sol';

/**
 * @dev Lending Market Controller contract is managing separated lending 
 * order-book markets (per term) and responsible to calculate Discount Factors per currency 
 * and construct yield curve
 *
 * It will store lending market addresses by ccy and term in lendingMarkets mapping.
 */
contract LendingMarketController is ProtocolTypes, ILendingMarketController {
    using SafeMath for uint256;
    using QuickSort for uint256[];

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event LendingMarketCreated(bytes32 ccy, uint256 term, address indexed marketAddr);
    event LendingMarketsPaused(bytes32 ccy);
    event LendingMarketsUnpaused(bytes32 ccy);
    
    bytes4 constant prefix = 0x21aaa47b;
    address public override owner;
    ICurrencyController public currencyController;
    ITermStructure public termStructure;
    uint256 public override numberOfMarkets = 0;

    mapping(bytes32 => mapping(uint256 => address)) public override lendingMarkets;
    mapping(bytes32 => uint256[]) public supportedTerms;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
    * @dev Lending Market Controller Constructor.
    */
    constructor() public {
        owner = msg.sender;
    }

    /**
    * @dev Sets owner of the controller market.
    * @param _owner Address of new owner
    */
    function setOwner(address _owner) public onlyOwner {
        require(_owner != address(0), "new owner is the zero address");
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    /**
    * @dev Triggers to link with Currency Controller contract.
    * @param addr CurrencyController smart contract address 
    *
    * @notice Executed only by contract owner
    */
    function setCurrencyController(address addr) public onlyOwner {
        currencyController = ICurrencyController(addr);
    }

    /**
    * @dev Triggers to link with TermStructure contract.
    * @param addr TermStructure smart contract address 
    *
    * @notice Executed only by contract owner
    */
    function setTermStructure(address addr) public onlyOwner {
        termStructure = ITermStructure(addr);
    }

    // =========== YIELD CURVE FUNCTIONS ===========

    /**
    * @dev Triggers to get borrow rates for selected currency.
    * @param _ccy Currency
    */
    function getBorrowRatesForCcy(bytes32 _ccy) public view override returns (uint256[NUMTERM] memory rates) {
        uint256[] memory terms = supportedTerms[_ccy];

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
    function getLendRatesForCcy(bytes32 _ccy) public view override returns (uint256[NUMTERM] memory rates) {
        uint256[] memory terms = supportedTerms[_ccy];

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
    function getMidRatesForCcy(bytes32 _ccy) public view override returns (uint256[NUMTERM] memory rates) {
        uint256[] memory terms = supportedTerms[_ccy];

        for (uint256 i = 0; i < terms.length; i++) {
            uint256 term = terms[i];
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            rates[i] = market.getMidRate();
        }

        return rates;
    }

    // =========== DISCOUNT FACTORS CALCULATION ===========

    // helper to generate DF
    function genDF(uint256[NUMDF] memory rates) private pure returns (DiscountFactor memory) {
        DiscountFactor memory df;
        // bootstrap in BasisPoint scale
        df.df3m = BP.mul(BP).div((BP.add(rates[0].mul(90).div(360))));
        df.df6m = BP.mul(BP).div((BP.add(rates[1].mul(180).div(360))));
        df.df1y = BP.mul(BP).div((BP.add(rates[2]))); 
        df.df2y = BP.mul(BP.sub(rates[3].mul(df.df1y).div(BP))).div(BP.add(rates[3]));
        df.df3y = BP.mul(BP.sub(rates[4].mul(df.df1y.add(df.df2y)).div(BP))).div(BP.add(rates[4]));
        df.df4y = BP.mul(BP.sub(rates[5].mul(df.df1y.add(df.df2y).add(df.df3y)).div(BP))).div(BP.add(rates[5]));
        df.df5y = BP.mul(BP.sub(rates[6].mul(df.df1y.add(df.df2y).add(df.df3y).add(df.df4y)).div(BP))).div(BP.add(rates[6]));
        return df;
    }

    function getDiscountFactorsForCcy(bytes32 _ccy) public view override returns (DiscountFactor memory) {
        uint256[NUMTERM] memory mkt = getMidRatesForCcy(_ccy);
        uint256[NUMDF] memory rates = [mkt[0], mkt[1], mkt[2], mkt[3], mkt[4], ((mkt[4].add(mkt[5])).div(2)), mkt[5]];
        return genDF(rates);
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
    function deployLendingMarket(bytes32 _ccy, uint256 _term) public onlyOwner override returns (address market) {
        require(currencyController.isSupportedCcy(_ccy), "NON SUPPORTED CCY");
        require(termStructure.isSupportedTerm(_term, prefix, _ccy), "NON SUPPORTED TERM");
        require(lendingMarkets[_ccy][_term] == address(0), "Couldn't rewrite existing market");
        market = address(new LendingMarket(_ccy, _term, address(this)));
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
    function pauseLendingMarkets(bytes32 _ccy) public onlyOwner override returns (bool) {
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
    function unpauseLendingMarkets(bytes32 _ccy) public onlyOwner override returns (bool) {
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
            market.order(uint8(order.side), order.amount, order.rate);
        }
    }
}