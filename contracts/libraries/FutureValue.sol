// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";

library FutureValue {
    function calculate(
        uint256 rate,
        uint256 amount,
        uint256 maturity
    ) external view returns (uint256) {
        // NOTE: The formula is:
        // remainingMaturity = maturity - now
        // futureValue = amount * (1 + rate * (maturity - now) / 360 days)
        uint256 currentRate = (rate * (maturity - block.timestamp)) / ProtocolTypes.SECONDS_IN_YEAR;
        return (amount * (ProtocolTypes.BP + currentRate)) / ProtocolTypes.BP;
    }
}
