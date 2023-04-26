// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library RoundingInt256 {
    function div(int256 a, int256 b) internal pure returns (int256) {
        require(b != 0);

        int256 diff = (a * 10) / b - (a / b) * 10;
        if (diff >= 5) {
            return (a / b) + 1;
        } else if (diff <= -5) {
            return (a / b) - 1;
        } else {
            return a / b;
        }
    }
}
