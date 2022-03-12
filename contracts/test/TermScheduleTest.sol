// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;

import "../libraries/TermSchedule.sol";

contract TermScheduleTest {
    function getTermSchedule(uint256 numDays, uint8 frequency)
        external
        view
        returns (uint256[] memory)
    {
        return TermSchedule.getTermSchedule(numDays, frequency);
    }

    function getNumPayments(uint256 numDays, uint8 frequency)
        external
        view
        returns (uint256)
    {
        return TermSchedule.getNumPayments(numDays, frequency);
    }

    function getDfFrac(uint256 numDays) external view returns (uint256) {
        return TermSchedule.getDfFrac(numDays);
    }

    function getGasCostOfGetTermSchedule(uint256 numDays, uint8 frequency)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        TermSchedule.getTermSchedule(numDays, frequency);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetNumPayment(uint256 numDays, uint8 frequency)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        TermSchedule.getNumPayments(numDays, frequency);

        return gasBefore - gasleft();
    }

    function getGasCostOfGetDfFrac(uint256 numDays)
        external
        view
        returns (uint256)
    {
        uint256 gasBefore = gasleft();
        TermSchedule.getDfFrac(numDays);

        return gasBefore - gasleft();
    }
}
