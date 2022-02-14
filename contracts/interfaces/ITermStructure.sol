// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface ITermStructure {
    event TermAdded(uint256 numDays);
    event ProductTermSupportUpdated(uint256 numDays, bytes4 product, bytes32 _ccy, bool isSupported);
    event TermSupportUpdated(uint256 numDays, bool isSupported);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    function getDfFrac(uint256 _numDays) external view returns (uint256);
    function getNumDays(uint256 _numDays) external view returns (uint256);
    function getNumPayments(uint256 _numDays, uint8 frequency) external view returns (uint256);
    function getTerm(uint256 _numDays, uint8 frequency) external view returns (uint256, uint256, uint256);
    function getTermSchedule(uint256 _numDays, uint8 frequency) external view returns (uint256[] memory);
    function isSupportedTerm(uint256 _numDays,bytes4 _product,bytes32 _ccy) external view returns (bool);
    function last_term_index() external view returns (uint8);
    function owner() external view returns (address);
    function setCurrencyController(address _currencyController) external;
    function setOwner(address _owner) external;
    function supportTerm(uint256 _numDays,bytes4[] memory _products,bytes32[] memory _currencies) external  returns (bool);
    function updateTermSupport(uint256 _numDays,bytes4 _product,bytes32 _ccy,bool _isSupported) external  returns (bool);
    function getTermsForProductAndCcy(bytes4 _product, bytes32 _ccy, bool sort) external view returns (uint256[] memory);
}