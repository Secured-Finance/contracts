// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {AggregatorV2V3Interface} from "../../dependencies/chainlink/AggregatorV2V3Interface.sol";

/**
 * @title A Chainlink-based aggregator contract powered by pyth network feeds
 * @notice This contract always uses the price publish time as the round id,
 * as pyth network does not have a concept of rounds.
 */
contract PythAggregator is AggregatorV2V3Interface {
    bytes32 public priceId;
    IPyth public pyth;
    string public description;

    // Maximum allowed confidence interval ratio: 20% = 2000 / 10000
    // NOTE: This 20% threshold is intentionally set as a fail-safe mechanism to reject
    // only extreme anomalies. Under normal Pyth operation, confidence intervals are
    // typically 5-10% of the price. This higher threshold (20%) ensures we don't reject
    // legitimate price data during high volatility while still protecting against oracle
    // manipulation or catastrophic market conditions that could breach the liquidation
    // threshold.
    uint256 public constant MAX_CONFIDENCE_RATIO = 2000;

    constructor(address _pyth, bytes32 _priceId, string memory _description) {
        priceId = _priceId;
        pyth = IPyth(_pyth);
        description = _description;
    }

    function updateFeeds(bytes[] calldata priceUpdateData) public payable {
        // Update the prices to the latest available values and pay the required fee for it. The `priceUpdateData` data
        // should be retrieved from our off-chain Price Service API using the `pyth-evm-js` package.
        // See section "How Pyth Works on EVM Chains" below for more information.
        uint fee = pyth.getUpdateFee(priceUpdateData);
        pyth.updatePriceFeeds{value: fee}(priceUpdateData);

        // Refund the entire contract balance to the caller.
        // NOTE: This code is intended to refund `address(this).balance` rather than `msg.value - fee`
        // to ensure robustness against Pyth's internal implementation. This approach guarantees
        // that any unused ETH is returned to the caller, regardless of how much the Pyth contract
        // actually consumed. This design does not depend on assumptions about Pyth's fee consumption
        // behavior.
        (bool success, ) = payable(msg.sender).call{value: address(this).balance}("");
        require(success, "PythAggregator: REFUND_FAILED");
    }

    function _validatePrice(PythStructs.Price memory price) internal pure {
        require(price.price > 0, "Invalid price");

        uint256 confidenceRatio = (uint256(uint64(price.conf)) * 10000) /
            uint256(uint64(price.price));
        require(confidenceRatio <= MAX_CONFIDENCE_RATIO, "Confidence too wide");
    }

    function decimals() public view virtual returns (uint8) {
        PythStructs.Price memory price = pyth.getPriceUnsafe(priceId);
        _validatePrice(price);
        require(price.expo < 0 && price.expo >= -255, "Invalid exponent");
        return uint8(uint32(-price.expo));
    }

    function version() public pure returns (uint256) {
        return 1;
    }

    function latestAnswer() public view virtual returns (int256) {
        PythStructs.Price memory price = pyth.getPriceUnsafe(priceId);
        _validatePrice(price);
        return int256(price.price);
    }

    function latestTimestamp() public view returns (uint256) {
        PythStructs.Price memory price = pyth.getPriceUnsafe(priceId);
        return price.publishTime;
    }

    function latestRound() public view returns (uint256) {
        // use timestamp as the round id
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
        PythStructs.Price memory price = pyth.getPriceUnsafe(priceId);
        _validatePrice(price);
        return (
            _roundId,
            int256(price.price),
            price.publishTime,
            price.publishTime,
            uint80(price.publishTime)
        );
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
        PythStructs.Price memory price = pyth.getPriceUnsafe(priceId);
        _validatePrice(price);
        roundId = uint80(price.publishTime);
        return (roundId, int256(price.price), price.publishTime, price.publishTime, roundId);
    }
}
