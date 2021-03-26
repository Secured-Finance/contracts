// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ProtocolTypes.sol";
import "./LendingMarket.sol";
import './interfaces/ILendingMarket.sol';

/**
 * @dev Lending Market Controller contract is managing separated lending 
 * order-book markets (per term) and responsible to calculate Discount Factors per currency 
 * and construct yield curve
 *
 * It will store lending market addresses by ccy and term in lendingMarkets mapping.
 */
contract LendingMarketController is ProtocolTypes {
    using SafeMath for uint256;

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event LendingMarketCreated(Ccy ccy, Term term, address indexed marketAddr);

    address public owner;

    mapping(Ccy => mapping(Term => address)) public lendingMarkets;

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

    // =========== YIELD CURVE FUNCTIONS ===========

    /**
    * @dev Triggers to get borrow rates for selected currency.
    * @param _ccy Currency
    */
    function getBorrowRatesForCcy(Ccy _ccy) public view returns (uint256[NUMTERM] memory rates) {
        for (uint8 i = 0; i < NUMTERM; i++) {
            Term term = Term(i);
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            rates[i] = market.getBorrowRate();
        }

        return rates;
    }

    /**
    * @dev Triggers to get lend rates for selected currency.
    * @param _ccy Currency
    */
    function getLendRatesForCcy(Ccy _ccy) public view returns (uint256[NUMTERM] memory rates) {
        for (uint8 i = 0; i < NUMTERM; i++) {
            Term term = Term(i);
            ILendingMarket market = ILendingMarket(lendingMarkets[_ccy][term]);
            rates[i] = market.getLendRate();
        }

        return rates;
    }

    /**
    * @dev Triggers to get mid rates for selected currency.
    * @param _ccy Currency
    */
    function getMidRatesForCcy(Ccy _ccy) public view returns (uint256[NUMTERM] memory rates) {
        for (uint8 i = 0; i < NUMTERM; i++) {
            Term term = Term(i);
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

    function getDiscountFactorsForCcy(Ccy _ccy) public view returns (DiscountFactor memory) {
        uint256[NUMTERM] memory mkt = getMidRatesForCcy(_ccy);
        uint256[NUMDF] memory rates = [mkt[0], mkt[1], mkt[2], mkt[3], mkt[4], ((mkt[4].add(mkt[5])).div(2)), mkt[5]];
        return genDF(rates);
    }

    // =========== MARKET DEPLOYMENT FUNCTIONS ===========

    /**
    * @dev Deploys new Lending Market and save address at lendingMarkets mapping.
    * @param _term Term for new Lending Market
    */
    function deployLendingMarket(Ccy _ccy, Term _term) public onlyOwner returns (address market) {
        require(lendingMarkets[_ccy][_term] == address(0), "Couldn't rewrite existing market");
        market = address(new LendingMarket(_ccy, _term));
        lendingMarkets[_ccy][_term] = market;

        emit LendingMarketCreated(_ccy, _term, market);
        return market;
    }
}