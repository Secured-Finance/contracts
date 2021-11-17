// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import '../interfaces/ILendingMarketController.sol';
import '../ProtocolTypes.sol';
import "@openzeppelin/contracts/math/SafeMath.sol";

contract LendingMarketControllerMock is ILendingMarketController, ProtocolTypes {
    using SafeMath for uint256;

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    address public override owner;

    mapping(bytes32 => mapping(uint8 => uint256)) public lendRates;
    mapping(bytes32 => mapping(uint8 => uint256)) public borrowRates;

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
    function setOwner(address _owner) public override onlyOwner {
        require(_owner != address(0), "new owner is the zero address");
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    /**
    * @dev Triggers to get borrow rates for selected currency.
    * @param _ccy Currency short identifier
    */
    function getBorrowRatesForCcy(bytes32 _ccy) public view override returns (uint256[NUMTERM] memory rates) {
        for (uint8 i = 0; i < 6; i++) {
            uint256 borrowRate = borrowRates[_ccy][i];

            rates[i] = borrowRate;
        }

        return rates;
    }

    /**
    * @dev Triggers to get lend rates for selected currency.
    * @param _ccy Currency short identifier
    */
    function getLendRatesForCcy(bytes32 _ccy) public view override returns (uint256[NUMTERM] memory rates) {
        for (uint8 i = 0; i < 6; i++) {
            uint256 lendRate = lendRates[_ccy][i];
            
            rates[i] = lendRate;
        }

        return rates;
    }

    /**
    * @dev Triggers to get mid rates for selected currency.
    * @param _ccy Currency short identifier
    */
    function getMidRatesForCcy(bytes32 _ccy) public view override returns (uint256[NUMTERM] memory rates) {
        for (uint8 i = 0; i < 6; i++) {
            uint256 borrowRate = borrowRates[_ccy][i];
            uint256 lendRate = lendRates[_ccy][i];
            uint256 combinedRate = borrowRate.add(lendRate); 

            rates[i] = combinedRate.div(2);
        }

        return rates;
    }

    /**
    * @dev Triggers to set borrow rates for selected currency.
    * @param _ccy Currency short identifier
    */
    function setBorrowRatesForCcy(bytes32 _ccy, uint256[NUMTERM] memory _rates) public onlyOwner {
        for (uint8 i = 0; i < _rates.length; i++) {
            borrowRates[_ccy][i] = _rates[i];
        }
    }

    /**
    * @dev Triggers to set lend rates for selected currency.
    * @param _ccy Currency short identifier
    */
    function setLendRatesForCcy(bytes32 _ccy, uint256[NUMTERM] memory _rates) public onlyOwner {
        for (uint8 i = 0; i < _rates.length; i++) {
            lendRates[_ccy][i] = _rates[i];
        }
    }

    // helper to generate DF
    function genDF(uint256[7] memory rates) private pure returns (DiscountFactor memory) {
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

    // =========== UNUSED FUNCTIONS ===========

    function deployLendingMarket(bytes32 _ccy,uint8 _term) public override returns (address) {
        _ccy;
        _term;
        return address(0);
    }

    function lendingMarkets(bytes32 _ccy,uint8 _term) public override view returns (address) {
        _ccy;
        _term;
        return address(0);
    }

    function pauseLendingMarkets(bytes32 _ccy) public override returns (bool) {
        _ccy;
        return true;
    }

    function unpauseLendingMarkets(bytes32 _ccy) public override returns (bool) {
        _ccy;
        return true;
    }

    function placeBulkOrders(Order[] memory orders) public override returns (bool) {
        orders;
        return true;
    }

}