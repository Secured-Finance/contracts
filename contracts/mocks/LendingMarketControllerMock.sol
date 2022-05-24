// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../interfaces/ILendingMarketController.sol";
import "../ProtocolTypes.sol";
import "../libraries/DiscountFactor.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract LendingMarketControllerMock is
    ILendingMarketController,
    ProtocolTypes
{
    using SafeMath for uint256;

    address public override owner;
    uint256 public override numberOfMarkets = 0;

    mapping(bytes32 => mapping(uint256 => uint256)) public lendRates;
    mapping(bytes32 => mapping(uint256 => uint256)) public borrowRates;
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
     * @dev Triggers to get borrow rates for selected currency.
     * @param _ccy Currency short identifier
     */
    function getBorrowRatesForCcy(bytes32 _ccy)
        public
        view
        override
        returns (uint256[] memory)
    {
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
    function getLendRatesForCcy(bytes32 _ccy)
        public
        view
        override
        returns (uint256[] memory)
    {
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
    function getMidRatesForCcy(bytes32 _ccy)
        public
        view
        override
        returns (uint256[] memory)
    {
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
    function setBorrowRatesForCcy(bytes32 _ccy, uint256[] memory _rates)
        public
        onlyOwner
    {
        for (uint8 i = 0; i < _rates.length; i++) {
            borrowRates[_ccy][i] = _rates[i];
        }
    }

    /**
     * @dev Triggers to set lend rates for selected currency.
     * @param _ccy Currency short identifier
     */
    function setLendRatesForCcy(bytes32 _ccy, uint256[] memory _rates)
        public
        onlyOwner
    {
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
        override
        returns (address)
    {
        _ccy;
        _term;
        return address(0);
    }

    function lendingMarkets(bytes32 _ccy, uint256 _term)
        public
        view
        override
        returns (address)
    {
        _ccy;
        _term;
        return address(0);
    }

    function pauseLendingMarkets(bytes32 _ccy) public override returns (bool) {
        _ccy;
        return true;
    }

    function unpauseLendingMarkets(bytes32 _ccy)
        public
        override
        returns (bool)
    {
        _ccy;
        return true;
    }

    function placeBulkOrders(Order[] memory orders)
        public
        override
        returns (bool)
    {
        orders;
        return true;
    }

    function setSupportedTerms(bytes32 _ccy, uint256[] memory terms) public {
        supportedTerms[_ccy] = terms;
    }

    function getSupportedTerms(bytes32 _ccy)
        public
        view
        override
        returns (uint256[] memory)
    {
        return supportedTerms[_ccy];
    }
}
