// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

interface IDiscountFactors {
    // Mark to market mechanism
    struct DiscountFactor {
        uint256 df3m;
        uint256 df6m;
        uint256 df1y;
        uint256 df2y;
        uint256 df3y;
        uint256 df4y;
        uint256 df5y;
    }
}