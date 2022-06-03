// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ILendingMarketController.sol";
import "../ProtocolTypes.sol";
import "../libraries/DiscountFactor.sol";

contract LendingMarketControllerMock is ILendingMarketController, ProtocolTypes, Ownable {
    using SafeMath for uint256;

    uint256 public override numberOfMarkets = 0;

    mapping(bytes32 => mapping(uint256 => uint256)) public lendRates;
    mapping(bytes32 => mapping(uint256 => uint256)) public borrowRates;
    mapping(bytes32 => uint256[]) public supportedTerms;

    /**
     * @dev Lending Market Controller Constructor.
     */
    constructor() Ownable() {}

    /**
     * @dev Triggers to get borrow rates for selected currency.
     * @param _ccy Currency short identifier
     */
    function getBorrowRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint8 i = 0; i < terms.length; i++) {
            uint256 borrowRate = borrowRates[_ccy][i];

            rates[i] = borrowRate;
        }

        return rates;
    }

    /**
     * @dev Triggers to get lend rates for selected currency.
     * @param _ccy Currency short identifier
     */
    function getLendRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint8 i = 0; i < terms.length; i++) {
            uint256 lendRate = lendRates[_ccy][i];

            rates[i] = lendRate;
        }

        return rates;
    }

    /**
     * @dev Triggers to get mid rates for selected currency.
     * @param _ccy Currency short identifier
     */
    function getMidRatesForCcy(bytes32 _ccy) public view override returns (uint256[] memory) {
        uint256[] memory terms = supportedTerms[_ccy];
        uint256[] memory rates = new uint256[](terms.length);

        for (uint8 i = 0; i < terms.length; i++) {
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
    function setBorrowRatesForCcy(bytes32 _ccy, uint256[] memory _rates) public onlyOwner {
        for (uint8 i = 0; i < _rates.length; i++) {
            borrowRates[_ccy][i] = _rates[i];
        }
    }

    /**
     * @dev Triggers to set lend rates for selected currency.
     * @param _ccy Currency short identifier
     */
    function setLendRatesForCcy(bytes32 _ccy, uint256[] memory _rates) public onlyOwner {
        for (uint8 i = 0; i < _rates.length; i++) {
            lendRates[_ccy][i] = _rates[i];
        }
    }

    function getDiscountFactorsForCcy(bytes32 _ccy)
        public
        view
        override
        returns (uint256[] memory, uint256[] memory)
    {
        uint256[] memory rates = getMidRatesForCcy(_ccy);

        return DiscountFactor.calculateDFs(rates, supportedTerms[_ccy]);
    }

    // =========== UNUSED FUNCTIONS ===========

    function deployLendingMarket(bytes32 _ccy, uint256 _term)
        public
        pure
        override
        returns (address)
    {
        _ccy;
        _term;
        return address(0);
    }

    function lendingMarkets(bytes32 _ccy, uint256 _term) public pure override returns (address) {
        _ccy;
        _term;
        return address(0);
    }

    function pauseLendingMarkets(bytes32 _ccy) public pure override returns (bool) {
        _ccy;
        return true;
    }

    function unpauseLendingMarkets(bytes32 _ccy) public pure override returns (bool) {
        _ccy;
        return true;
    }

    function placeBulkOrders(Order[] memory orders) public pure override returns (bool) {
        orders;
        return true;
    }

    function setSupportedTerms(bytes32 _ccy, uint256[] memory terms) public {
        supportedTerms[_ccy] = terms;
    }

    function getSupportedTerms(bytes32 _ccy) public view override returns (uint256[] memory) {
        return supportedTerms[_ccy];
    }
}
