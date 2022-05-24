// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../libraries/DiscountFactor.sol";

contract DiscountFactorTest {
    function bootstrapTerms(uint256[] memory rates, uint256[] memory terms)
        external
        view
        returns (uint256[] memory, uint256[] memory)
    {
        return DiscountFactor.bootstrapTerms(rates, terms);
    }

    function getGasCostOfBootstrapTerms(
        uint256[] memory rates,
        uint256[] memory terms
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        DiscountFactor.bootstrapTerms(rates, terms);

        return gasBefore - gasleft();
    }

    function calculateDFs(uint256[] memory rates, uint256[] memory terms)
        external
        view
        returns (uint256[] memory, uint256[] memory)
    {
        return DiscountFactor.calculateDFs(rates, terms);
    }

    function getGasCostOfCalculateDFs(
        uint256[] memory rates,
        uint256[] memory terms
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        DiscountFactor.calculateDFs(rates, terms);

        return gasBefore - gasleft();
    }

    function interpolateDF(
        uint256[] memory discountFactors,
        uint256[] memory terms,
        uint256 date
    ) external view returns (uint256) {
        return DiscountFactor.interpolateDF(discountFactors, terms, date);
    }

    function getGasCostOfInterpolateDF(
        uint256[] memory discountFactors,
        uint256[] memory terms,
        uint256 date
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        DiscountFactor.interpolateDF(discountFactors, terms, date);

        return gasBefore - gasleft();
    }
}
