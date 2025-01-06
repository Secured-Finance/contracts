// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {SafeCast} from "../../dependencies/openzeppelin/utils/math/SafeCast.sol";
import {IParasailAggregator} from "./interfaces/IParasailAggregator.sol";
import {IWPFIL} from "./interfaces/IWPFIL.sol";
import {AggregatorV2V3Interface} from "../../dependencies/chainlink/AggregatorV2V3Interface.sol";

contract ParasailWPFILAggregator is AggregatorV2V3Interface {
    using SafeCast for uint256;

    IWPFIL wpfil;
    IParasailAggregator aggregator;

    constructor(address _aggregator, address _wpfil) {
        aggregator = IParasailAggregator(_aggregator);
        wpfil = IWPFIL(_wpfil);
    }

    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    function description() public pure returns (string memory) {
        return "wpFIL / FIL";
    }

    function version() public pure returns (uint256) {
        return 1;
    }

    function latestAnswer() public view returns (int256) {
        return wpfil.getPFILByWPFIL(aggregator.getAggregatedPrice()).toInt256();
    }

    function latestTimestamp() public view returns (uint256) {
        return block.timestamp;
    }

    function latestRound() public view returns (uint256) {
        return latestTimestamp();
    }

    function getAnswer(uint256) public view returns (int256) {
        return latestAnswer();
    }

    function getTimestamp(uint256) external view returns (uint256) {
        return latestTimestamp();
    }

    // NOTE: This functions returns the latest round data since WPFIL does not have historical data
    function getRoundData(
        uint80 _roundId
    )
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        uint256 timestamp = latestTimestamp();
        return (_roundId, latestAnswer(), timestamp, timestamp, uint80(timestamp));
    }

    function latestRoundData()
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        uint256 timestamp = latestTimestamp();
        roundId = uint80(timestamp);
        return (roundId, latestAnswer(), timestamp, timestamp, roundId);
    }
}
