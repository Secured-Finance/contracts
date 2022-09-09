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

interface ILendingMarketController {
    event LendingMarketCreated(
        bytes32 ccy,
        address indexed marketAddr,
        uint256 index,
        uint256 maturity
    );
    event LendingMarketsRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);
    event OrderPlaced(
        uint256 orderId,
        address indexed maker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 maturity,
        uint256 amount,
        uint256 rate
    );
    event OrderFilled(
        uint256 orderId,
        address indexed maker,
        address indexed taker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 maturity,
        uint256 amount,
        uint256 rate
    );
    event OrderCanceled(
        uint256 orderId,
        address indexed maker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 maturity,
        uint256 amount,
        uint256 rate
    );

    function getBasisDate(bytes32 _ccy) external view returns (uint256);

    function getLendingMarkets(bytes32 _ccy) external view returns (address[] memory);

    function getLendingMarket(bytes32 _ccy, uint256 _maturity) external view returns (address);

    function getBorrowRates(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getLendRates(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getMidRates(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getMaturities(bytes32 _ccy) external view returns (uint256[] memory);

    function getTotalPresentValue(bytes32 ccy, address account) external view returns (int256);

    function getTotalPresentValueInETH(address account)
        external
        view
        returns (int256 totalPresentValue);

    function isInitializedLendingMarket(bytes32 _ccy) external view returns (bool);

    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _compoundFactor
    ) external;

    function createLendingMarket(bytes32 _ccy) external returns (address market);

    function rotateLendingMarkets(bytes32 _ccy) external;

    function pauseLendingMarkets(bytes32 _ccy) external returns (bool);

    function unpauseLendingMarkets(bytes32 _ccy) external returns (bool);
}
