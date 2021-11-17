// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./IDiscountFactors.sol";

interface IMarketConroller is IDiscountFactors {
    function getBorrowRatesForCcy(bytes32 _ccy) external view returns (uint256[6] memory rates);
    function getDiscountFactorsForCcy(bytes32 _ccy) external view returns (IDiscountFactors.DiscountFactor memory);
    function getLendRatesForCcy(bytes32 _ccy) external view returns (uint256[6] memory rates);
    function getMidRatesForCcy(bytes32 _ccy) external view returns (uint256[6] memory rates);
}