// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import './interfaces/ITermStructure.sol';
import './interfaces/ICurrencyController.sol';
import './interfaces/IProductAddressResolver.sol';
import "./libraries/QuickSort.sol";

/**
 * @dev Term Structure contract is responsible for managing supported 
 * terms in Secured Finance Protocol per product and currency
 *
 */
contract TermStructure is ITermStructure {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using QuickSort for uint256[];

    address public override owner;
    uint8 public override last_term_index;

    ICurrencyController private currencyController;
    IProductAddressResolver private productResolver;

    struct Term {
        uint256 numDays;
        uint256 dfFrac;
        uint256 numPayments;
    }

    mapping(uint256 => Term) private terms;
    mapping(uint256 => uint256[]) private termSchedules;
    mapping(bytes4 => mapping(bytes32 => EnumerableSet.UintSet)) private termsForProductAndCcy;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier existingTermOnly(uint256 _numDays) {
        require(terms[_numDays].numDays != 0, "NON EXISTING TERM");
        _;
    }

    /**
    * @dev Term Structure Constructor.
    */
    constructor(address _currencyController, address _productAddressResolver) public {
        owner = msg.sender;
        currencyController = ICurrencyController(_currencyController);
        productResolver = IProductAddressResolver(_productAddressResolver);
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
    * @dev Triggers to link with Currency Controller contract.
    * @param _currencyController CurrencyController smart contract address 
    *
    * @notice Executed only by contract owner
    */
    function setCurrencyController(address _currencyController) public override onlyOwner {
        currencyController = ICurrencyController(_currencyController);
    }

    /**
    * @dev Triggers to add new term into the protocol
    * @param _numDays Number of calendar days in a term
    * @param _dfFrac Discount factor fractions (for terms less that 365 days)
    * @param _numPayments Number of coupon payments
    * @param _couponSchedule Schedule of days used to construct term structure of a deal
    * @param _currencies Array of currencies supporting this term
    * @param _products Array of products supporting this term
    */
    function supportTerm(
        uint256 _numDays,
        uint256 _dfFrac,
        uint256 _numPayments,
        uint256[] memory _couponSchedule,
        bytes4[] memory _products,
        bytes32[] memory _currencies
    ) onlyOwner public override returns (bool) {
        last_term_index = last_term_index++;

        Term memory term;
        term.numDays = _numDays;
        term.dfFrac = _dfFrac;
        term.numPayments = _numPayments;

        terms[_numDays] = term;
        termSchedules[_numDays] = _couponSchedule;

        if (_products.length > 0) {
            for (uint256 i = 0; i < _products.length ; i++) {
                bytes4 product = _products[i];

                for (uint256 j = 0; j < _currencies.length ; j++) {
                    bytes32 ccy = _currencies[j];
                    updateTermSupport(_numDays, product, ccy, true);
                }
            }
        }

        emit TermAdded(_numDays, _dfFrac, _numPayments);
    }

    /**
    * @dev Triggers to update product and currency support for term
    * @param _numDays Number of days in term
    * @param _product Product prefix
    * @param _ccy Currency short identifier
    * @param _isSupported Boolean whether term supported for specified `_product` and `_ccy`
    */
    function updateTermSupport(uint256 _numDays, bytes4 _product, bytes32 _ccy, bool _isSupported) onlyOwner existingTermOnly(_numDays) public override returns (bool) {
        require(productResolver.isSupportedProduct(_product), "NON SUPPORTED PRODUCT");
        require(currencyController.isSupportedCcy(_ccy), "NON SUPPORTED CCY");

        if (_isSupported) {
            termsForProductAndCcy[_product][_ccy].add(_numDays);
        } else {
            termsForProductAndCcy[_product][_ccy].remove(_numDays);
        }

        emit ProductTermSupportUpdated(_numDays, _product, _ccy, _isSupported);
    }

    /**
    * @dev Triggers to get term structure.
    * @param _numDays Number of days in term
    */
    function getTerm(uint256 _numDays) public override view returns (uint256, uint256, uint256) {
        Term memory term = terms[_numDays];
        return (
            term.numDays, 
            term.dfFrac,
            term.numPayments
        );
    }

    /**
    * @dev Triggers to get number of days for supported term. 
    * number of days follows ACT365 market convention 
    * @param _numDays Number of days in term
    */
    function getTermSchedule(uint256 _numDays) public override view returns (uint256[] memory) {
        return termSchedules[_numDays];
    }

    /**
    * @dev Triggers to get number of days for supported term. 
    * number of days follows ACT365 market convention 
    * @param _numDays Number of days in term
    */
    function getNumDays(uint256 _numDays) public override view returns (uint256) {
        return terms[_numDays].numDays;
    }

    /**
    * @dev Triggers to get discount factor fractions.
    * @param _numDays Number of days in term
    */
    function getDfFrac(uint256 _numDays) public override view returns (uint256) {
        return terms[_numDays].dfFrac;
    }

    /**
    * @dev Triggers to get number of coupon payments.
    * @param _numDays Number of days in term
    */
    function getNumPayments(uint256 _numDays) public override view returns (uint256) {
        return terms[_numDays].numPayments;
    }

    /**
    * @dev Triggers to get if specified term is supported for a particular ccy and product.
    * @param _numDays Number of days in term
    * @param _product Product prefix
    * @param _ccy Currency short identifier
    */
    function isSupportedTerm(uint256 _numDays, bytes4 _product, bytes32 _ccy) public override view returns (bool) {
        EnumerableSet.UintSet storage set = termsForProductAndCcy[_product][_ccy];
        return set.contains(_numDays);
    }

    /**
    * @dev Returns an array of supported terms for a specific product and currency
    * @param _product Product prefix
    * @param _ccy Currency short identifier
    */
    function getTermsForProductAndCcy(bytes4 _product, bytes32 _ccy, bool sort) public override view returns (uint256[] memory) {
        EnumerableSet.UintSet storage set = termsForProductAndCcy[_product][_ccy];
        uint256 numTerms = set.length();
        uint256[] memory supportedTerms = new uint256[](numTerms);

        for (uint256 i = 0; i < numTerms; i++) {
            uint256 term = set.at(i);
            supportedTerms[i] = term;
        }

        if (sort) {
            supportedTerms = supportedTerms.sort();
        }
        
        return supportedTerms;
    }

}