// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library RoundingUint256 {
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0);

        if ((a * 10) / b - (a / b) * 10 < 5) {
            return a / b;
        } else {
            return (a / b) + 1;
        }
    }
}
