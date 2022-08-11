// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";

struct Order {
    bytes32 ccy;
    uint256 term;
    ProtocolTypes.Side side;
    uint256 amount;
    uint256 rate;
}

interface ILendingMarketControllerV2 {
    event LendingMarketCreated(bytes32 ccy, address indexed marketAddr, uint256 index);
    event LendingMarketsPaused(bytes32 ccy);
    event LendingMarketsUnpaused(bytes32 ccy);

    event LendingMarketsRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);

    function getBorrowRatesForCcy(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getLendRatesForCcy(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getMidRatesForCcy(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getLendingMarket(bytes32, uint256) external view returns (address);

    function getTotalPresentValue(bytes32 ccy, address account) external view returns (int256);

    function createLendingMarket(bytes32 _ccy) external returns (address market);

    function pauseLendingMarkets(bytes32 _ccy) external returns (bool);

    function placeBulkOrders(Order[] memory orders) external returns (bool);

    function unpauseLendingMarkets(bytes32 _ccy) external returns (bool);
}
