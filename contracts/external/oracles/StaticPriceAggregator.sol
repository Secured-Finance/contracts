// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IInfinityPool} from "./interfaces/IInfinityPool.sol";
import {AggregatorV2V3Interface} from "../../dependencies/chainlink/AggregatorV2V3Interface.sol";

contract StaticPriceAggregator is AggregatorV2V3Interface {
    int256 public immutable latestAnswer;
    string public description;

    constructor(int256 _price, string memory _description) {
        latestAnswer = _price;
        description = _description;
    }

    function decimals() public view virtual returns (uint8) {
        return 8;
    }

    function version() public pure returns (uint256) {
        return 1;
    }

    function latestTimestamp() public view returns (uint256) {
        return block.timestamp;
    }

    function latestRound() public view returns (uint256) {
        return latestTimestamp();
    }

    function getAnswer(uint256) public view returns (int256) {
        return latestAnswer;
    }

    function getTimestamp(uint256) external view returns (uint256) {
        return latestTimestamp();
    }

    // NOTE: This functions returns the latest round data since this aggregator does not have historical data
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
        return (_roundId, latestAnswer, timestamp, timestamp, uint80(timestamp));
    }

    function latestRoundData()
        external
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
        return (uint80(timestamp), latestAnswer, timestamp, timestamp, uint80(timestamp));
    }
}
