// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface IMarketController {
    function getBorrowRatesForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory rates);

    function getDiscountFactorsForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory, uint256[] memory);

    function getLendRatesForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory rates);

    function getMidRatesForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory rates);
}
