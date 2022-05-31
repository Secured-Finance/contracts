// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../TermStructure.sol";

contract TermStructureTest is TermStructure {
    constructor(address _resolver) TermStructure(_resolver) {}

    function getGasCostOfGetTerm(uint256 _numDays, uint8 frequency)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        getTerm(_numDays, frequency);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetTermSchedule(uint256 _numDays, uint8 frequency)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        getTermSchedule(_numDays, frequency);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetNumDays(uint256 _numDays) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        getNumDays(_numDays);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetDfFrac(uint256 _numDays) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        getDfFrac(_numDays);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetNumPayments(uint256 _numDays, uint8 frequency)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        getNumPayments(_numDays, frequency);

        return gasBefore - gasleft();
    }

    function getGasCostOfIsSupportedTerm(
        uint256 _numDays,
        bytes4 _product,
        bytes32 _ccy
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        isSupportedTerm(_numDays, _product, _ccy);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetTermsForProductAndCcy(
        bytes4 _product,
        bytes32 _ccy,
        bool sort
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        getTermsForProductAndCcy(_product, _ccy, sort);

        return gasBefore - gasleft();
    }
}
