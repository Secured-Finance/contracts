// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {AggregatorV2V3Interface} from "../../dependencies/chainlink/AggregatorV2V3Interface.sol";
import {Ownable} from "../../protocol/utils/Ownable.sol";

/**
 * @title SimplePriceAggregator
 * @notice Owner-managed Chainlink-compatible price aggregator with round history.
 */
contract SimplePriceAggregator is AggregatorV2V3Interface, Ownable {
    uint256 public constant override version = 1;

    string public override description;
    uint256 public override latestRound;

    mapping(uint256 => int256) private answers;
    mapping(uint256 => uint256) private timestamps;

    constructor(int256 _initialAnswer, string memory _description) {
        _transferOwnership(msg.sender);
        description = _description;
        _updateAnswer(_initialAnswer);
    }

    function decimals() external pure override returns (uint8) {
        return 8;
    }

    function latestAnswer() external view override returns (int256) {
        return answers[latestRound];
    }

    function latestTimestamp() external view override returns (uint256) {
        return timestamps[latestRound];
    }

    function getAnswer(uint256 _roundId) external view override returns (int256) {
        return answers[_roundId];
    }

    function getTimestamp(uint256 _roundId) external view override returns (uint256) {
        return timestamps[_roundId];
    }

    function updateAnswer(int256 _answer) external onlyOwner {
        _updateAnswer(_answer);
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(_roundId > 0 && _roundId <= latestRound, "No data present");

        uint256 timestamp = timestamps[_roundId];
        return (_roundId, answers[_roundId], timestamp, timestamp, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = uint80(latestRound);
        uint256 timestamp = timestamps[latestRound];
        return (roundId, answers[latestRound], timestamp, timestamp, roundId);
    }

    function _updateAnswer(int256 _answer) private {
        latestRound++;

        uint256 timestamp = block.timestamp;
        answers[latestRound] = _answer;
        timestamps[latestRound] = timestamp;

        emit NewRound(latestRound, msg.sender, timestamp);
        emit AnswerUpdated(_answer, latestRound, timestamp);
    }
}
