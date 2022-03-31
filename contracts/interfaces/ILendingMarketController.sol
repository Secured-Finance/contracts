// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

struct Order {
    bytes32 ccy;
    uint256 term;
    uint8 side;
    uint256 amount;
    uint256 rate;
}

interface ILendingMarketController {
    event LendingMarketCreated(
        bytes32 ccy,
        uint256 term,
        address indexed marketAddr
    );
    event LendingMarketsPaused(bytes32 ccy);
    event LendingMarketsUnpaused(bytes32 ccy);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    function deployLendingMarket(bytes32 _ccy, uint256 _term)
        external
        returns (address market);

    function getBorrowRatesForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory rates);

    function getDiscountFactorsForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory, uint256[] memory);

    function getLendRatesForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory rates);

    function getMidRatesForCcy(bytes32 _ccy)
        external
        view
        returns (uint256[] memory rates);

    function lendingMarkets(bytes32, uint256) external view returns (address);

    function owner() external view returns (address);

    function pauseLendingMarkets(bytes32 _ccy) external returns (bool);

    function placeBulkOrders(Order[] memory orders) external returns (bool);

    function unpauseLendingMarkets(bytes32 _ccy) external returns (bool);

    function numberOfMarkets() external view returns (uint256);

    function getSupportedTerms(bytes32 _ccy)
        external
        view
        returns (uint256[] memory);
}