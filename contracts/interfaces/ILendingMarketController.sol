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
    event CreateLendingMarket(
        bytes32 indexed ccy,
        address indexed marketAddr,
        address futureValue,
        uint256 index,
        uint256 maturity
    );
    event RotateLendingMarkets(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);
    event PlaceOrder(
        address indexed maker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 indexed maturity,
        uint256 amount,
        uint256 unitPrice
    );
    event FillOrder(
        address indexed taker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 indexed maturity,
        uint256 amount,
        uint256 unitPrice,
        uint256 filledFutureValue
    );
    event FillOrders(
        address indexed taker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 indexed maturity,
        uint256 filledFutureValue
    );
    event CancelOrder(
        uint48 orderId,
        address indexed maker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 maturity,
        uint256 amount,
        uint256 unitPrice
    );

    function getBasisDate(bytes32 _ccy) external view returns (uint256);

    function getLendingMarkets(bytes32 _ccy) external view returns (address[] memory);

    function getLendingMarket(bytes32 _ccy, uint256 _maturity) external view returns (address);

    function getFutureValueVault(bytes32 _ccy, uint256 _maturity) external view returns (address);

    function getBorrowUnitPrices(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getLendUnitPrices(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getMidUnitPrices(bytes32 _ccy) external view returns (uint256[] memory rates);

    function getBorrowOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getLendOrderBook(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getMaturities(bytes32 _ccy) external view returns (uint256[] memory);

    // function getPresentValue(
    //     bytes32 _ccy,
    //     uint256 _maturity,
    //     address _account
    // ) external view returns (int256);

    function getTotalPresentValue(bytes32 ccy, address account) external view returns (int256);

    function getTotalPresentValueInETH(address account)
        external
        view
        returns (int256 totalPresentValue);

    function calculateTotalLentFundsInETH(address _account)
        external
        view
        returns (uint256 totalWorkingOrderAmount, uint256 totalClaimAmount);

    function calculateTotalBorrowedFundsInETH(address account)
        external
        view
        returns (
            uint256 totalWorkingOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount
        );

    function isInitializedLendingMarket(bytes32 _ccy) external view returns (bool);

    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _basisDate,
        uint256 _compoundFactor
    ) external;

    function createLendingMarket(bytes32 _ccy)
        external
        returns (address market, address futureValue);

    function createOrder(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _amount,
        uint256 _rate
    ) external returns (bool);

    function createLendOrderWithETH(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _rate
    ) external payable returns (bool);

    function cancelOrder(
        bytes32 _ccy,
        uint256 _maturity,
        uint48 _orderId
    ) external returns (bool);

    function rotateLendingMarkets(bytes32 _ccy) external;

    function pauseLendingMarkets(bytes32 _ccy) external returns (bool);

    function unpauseLendingMarkets(bytes32 _ccy) external returns (bool);

    function convertFutureValueToGenesisValue(address _user) external;

    function cleanOrders(address _account) external;
}
