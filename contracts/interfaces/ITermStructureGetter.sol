// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ITermStructureGetter {
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
}
