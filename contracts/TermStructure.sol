// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITermStructure.sol";
import "./libraries/QuickSort.sol";
import "./libraries/TermSchedule.sol";
import "./mixins/MixinAddressResolver.sol";

/**
 * @dev Term Structure contract is responsible for managing supported
 * terms in Secured Finance Protocol per product and currency
 *
 */
contract TermStructure is ITermStructure, MixinAddressResolver, Ownable {
    using EnumerableSet for EnumerableSet.UintSet;
    using QuickSort for uint256[];

    uint8 public override last_term_index;

    struct Term {
        uint256 numDays;
        uint256 dfFrac;
        uint256 numPayments;
    }

    mapping(uint256 => uint256) private terms;
    mapping(bytes4 => mapping(bytes32 => EnumerableSet.UintSet)) private termsForProductAndCcy;

    modifier existingTermOnly(uint256 _numDays) {
        require(terms[_numDays] == _numDays, "NON EXISTING TERM");
        _;
    }

    /**
     * @dev Contract constructor function.
     * @param _resolver The address of the Address Resolver contract
     */
    constructor(address _resolver) MixinAddressResolver(_resolver) Ownable() {}

    function requiredContracts() public pure override returns (bytes32[] memory contracts) {
        contracts = new bytes32[](2);
        contracts[0] = Contracts.CURRENCY_CONTROLLER;
        contracts[1] = Contracts.PRODUCT_ADDRESS_RESOLVER;
    }

    /**
     * @dev Triggers to add new term into the protocol
     * @param _numDays Number of calendar days in a term
     * @param _currencies Array of currencies supporting this term
     * @param _products Array of products supporting this term
     */
    function supportTerm(
        uint256 _numDays,
        bytes4[] memory _products,
        bytes32[] memory _currencies
    ) public override onlyOwner {
        last_term_index = last_term_index++;

        terms[_numDays] = _numDays;

        if (_products.length > 0) {
            for (uint256 i = 0; i < _products.length; i++) {
                bytes4 product = _products[i];

                for (uint256 j = 0; j < _currencies.length; j++) {
                    bytes32 ccy = _currencies[j];
                    updateTermSupport(_numDays, product, ccy, true);
                }
            }
        }

        emit TermAdded(_numDays);
    }

    /**
     * @dev Triggers to update product and currency support for term
     * @param _numDays Number of days in term
     * @param _product Product prefix
     * @param _ccy Currency short identifier
     * @param _isSupported Boolean whether term supported for specified `_product` and `_ccy`
     */
    function updateTermSupport(
        uint256 _numDays,
        bytes4 _product,
        bytes32 _ccy,
        bool _isSupported
    ) public override onlyOwner existingTermOnly(_numDays) {
        require(productAddressResolver().isSupportedProduct(_product), "NON SUPPORTED PRODUCT");
        require(currencyController().isSupportedCcy(_ccy), "NON SUPPORTED CCY");

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
    function getTerm(uint256 _numDays, uint8 _frequency)
        public
        view
        override
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        Term memory term;

        term.numDays = terms[_numDays];
        term.dfFrac = getDfFrac(_numDays);
        term.numPayments = getNumPayments(_numDays, _frequency);

        return (term.numDays, term.dfFrac, term.numPayments);
    }

    /**
     * @dev Triggers to get payment schedule for supported term according to the payment frequency
     * number of days follows ACT365 market convention
     * @param _numDays Number of days in term
     * @param _frequency Payment frequency (like annual, semi-annual, etc.)
     */
    function getTermSchedule(uint256 _numDays, uint8 _frequency)
        public
        pure
        override
        returns (uint256[] memory)
    {
        return TermSchedule.getTermSchedule(_numDays, _frequency);
    }

    /**
     * @dev Triggers to get number of days for supported term.
     * number of days follows ACT365 market convention
     * @param _numDays Number of days in term
     */
    function getNumDays(uint256 _numDays) public view override returns (uint256) {
        return terms[_numDays];
    }

    /**
     * @dev Triggers to get discount factor fractions.
     * @param _numDays Number of days in term
     */
    function getDfFrac(uint256 _numDays) public pure override returns (uint256) {
        return TermSchedule.getDfFrac(_numDays);
    }

    /**
     * @dev Triggers to get number of coupon payments.
     * @param _numDays Number of days in term
     * @param _frequency Payment frequency (like annual, semi-annual, etc.)
     */
    function getNumPayments(uint256 _numDays, uint8 _frequency)
        public
        pure
        override
        returns (uint256)
    {
        return TermSchedule.getNumPayments(_numDays, _frequency);
    }

    /**
     * @dev Triggers to get if specified term is supported for a particular ccy and product.
     * @param _numDays Number of days in term
     * @param _product Product prefix
     * @param _ccy Currency short identifier
     */
    function isSupportedTerm(
        uint256 _numDays,
        bytes4 _product,
        bytes32 _ccy
    ) public view override returns (bool) {
        EnumerableSet.UintSet storage set = termsForProductAndCcy[_product][_ccy];
        return set.contains(_numDays);
    }

    /**
     * @dev Returns an array of supported terms for a specific product and currency
     * @param _product Product prefix
     * @param _ccy Currency short identifier
     */
    function getTermsForProductAndCcy(
        bytes4 _product,
        bytes32 _ccy,
        bool sort
    ) public view override returns (uint256[] memory) {
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
