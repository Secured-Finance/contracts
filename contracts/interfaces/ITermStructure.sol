// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ITermStructure {
    event TermAdded(uint256 numDays);
    event ProductTermSupportUpdated(
        uint256 numDays,
        bytes4 product,
        bytes32 _ccy,
        bool isSupported
    );
    event TermSupportUpdated(uint256 numDays, bool isSupported);

    function getDfFrac(uint256 _numDays) external view returns (uint256);

    function getNumDays(uint256 _numDays) external view returns (uint256);

    function getNumPayments(uint256 _numDays, uint8 frequency) external view returns (uint256);

    function getTerm(uint256 _numDays, uint8 frequency)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function getTermSchedule(uint256 _numDays, uint8 frequency)
        external
        view
        returns (uint256[] memory);

    function isSupportedTerm(
        uint256 _numDays,
        bytes4 _product,
        bytes32 _ccy
    ) external view returns (bool);

    function last_term_index() external view returns (uint8);

    function supportTerm(
        uint256 _numDays,
        bytes4[] memory _products,
        bytes32[] memory _currencies
    ) external;

    function updateTermSupport(
        uint256 _numDays,
        bytes4 _product,
        bytes32 _ccy,
        bool _isSupported
    ) external;

    function getTermsForProductAndCcy(
        bytes4 _product,
        bytes32 _ccy,
        bool sort
    ) external view returns (uint256[] memory);
}
