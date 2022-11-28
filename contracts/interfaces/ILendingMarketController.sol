// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";

interface ILendingMarketController {
    event CreateLendingMarket(
        bytes32 indexed ccy,
        address indexed marketAddr,
        address futureValueVault,
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
    event FillOrdersAsync(
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

    function getGenesisDate(bytes32 ccy) external view returns (uint256);

    function getLendingMarkets(bytes32 ccy) external view returns (address[] memory);

    function getLendingMarket(bytes32 ccy, uint256 maturity) external view returns (address);

    function getFutureValueVault(bytes32 ccy, uint256 maturity) external view returns (address);

    function getBorrowUnitPrices(bytes32 ccy) external view returns (uint256[] memory unitPrices);

    function getLendUnitPrices(bytes32 ccy) external view returns (uint256[] memory unitPrices);

    function getMidUnitPrices(bytes32 ccy) external view returns (uint256[] memory unitPrices);

    function getBorrowOrderBook(
        bytes32 ccy,
        uint256 maturity,
        uint256 limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getLendOrderBook(
        bytes32 ccy,
        uint256 maturity,
        uint256 limit
    )
        external
        view
        returns (
            uint256[] memory unitPrices,
            uint256[] memory amounts,
            uint256[] memory quantities
        );

    function getMaturities(bytes32 ccy) external view returns (uint256[] memory);

    function getTotalPresentValue(bytes32 ccy, address user) external view returns (int256);

    function getTotalPresentValueInETH(address user)
        external
        view
        returns (int256 totalPresentValue);

    function calculateTotalFundsInETH(address _user)
        external
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalEvaluatedClaimableAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalObligationAmount,
            uint256 totalBorrowedAmount
        );

    function isInitializedLendingMarket(bytes32 ccy) external view returns (bool);

    function initializeLendingMarket(
        bytes32 ccy,
        uint256 genesisDate,
        uint256 compoundFactor
    ) external;

    function createLendingMarket(bytes32 ccy)
        external
        returns (address market, address futureValue);

    function createOrder(
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    ) external returns (bool);

    function depositAndCreateOrder(
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    ) external returns (bool);

    function createLendOrderWithETH(
        bytes32 ccy,
        uint256 maturity,
        uint256 unitPrice
    ) external payable returns (bool);

    function depositAndCreateLendOrderWithETH(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _unitPrice
    ) external payable returns (bool);

    function cancelOrder(
        bytes32 ccy,
        uint256 maturity,
        uint48 orderId
    ) external returns (bool);

    function rotateLendingMarkets(bytes32 ccy) external;

    function pauseLendingMarkets(bytes32 ccy) external returns (bool);

    function unpauseLendingMarkets(bytes32 ccy) external returns (bool);

    function cleanAllOrders(address user) external;

    function cleanOrders(bytes32 _ccy, address _user) external;
}
