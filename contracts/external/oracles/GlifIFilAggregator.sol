// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {IInfinityPool} from "./interfaces/IInfinityPool.sol";

contract GlifIFilAggregator {
    IInfinityPool pool;

    constructor(address _pool) {
        pool = IInfinityPool(_pool);
    }

    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    function description() public pure returns (string memory) {
        return "iFIL / FIL";
    }

    function version() public pure returns (uint256) {
        return 1;
    }

    function latestAnswer() public view returns (int256) {
        return int256(pool.convertToAssets(1e18));
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
