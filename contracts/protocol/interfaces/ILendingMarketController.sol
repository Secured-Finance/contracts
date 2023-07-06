// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../types/ProtocolTypes.sol";

interface ILendingMarketController {
    struct Order {
        uint48 orderId;
        bytes32 ccy;
        uint256 maturity;
        ProtocolTypes.Side side;
        uint256 unitPrice;
        uint256 amount;
        uint256 timestamp;
        bool isPreOrder;
    }

    struct Position {
        bytes32 ccy;
        uint256 maturity;
        int256 presentValue;
        int256 futureValue;
    }

    function isTerminated() external view returns (bool);

    function isRedemptionRequired(address _user) external view returns (bool);

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

    function getUsedCurrencies(address user) external view returns (bytes32[] memory);

    function getTotalPresentValue(bytes32 ccy, address user) external view returns (int256);

    function getTotalPresentValueInBaseCurrency(address user)
        external
        view
        returns (int256 totalPresentValue);

    function getGenesisValue(bytes32 ccy, address user) external view returns (int256 genesisValue);

    function getOrders(bytes32[] memory ccys, address user)
        external
        view
        returns (Order[] memory activeOrders, Order[] memory inactiveOrders);

    function getPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) external view returns (int256 presentValue, int256 futureValue);

    function getPositions(bytes32[] memory ccys, address user)
        external
        view
        returns (Position[] memory positions);

    function calculateFunds(bytes32 ccy, address user)
        external
        view
        returns (
            uint256 workingLendOrdersAmount,
            uint256 claimableAmount,
            uint256 collateralAmount,
            uint256 lentAmount,
            uint256 workingBorrowOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        );

    function calculateTotalFundsInBaseCurrency(
        address user,
        bytes32 depositCcy,
        uint256 depositAmount
    )
        external
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount,
            bool isEnoughDeposit
        );

    function isInitializedLendingMarket(bytes32 ccy) external view returns (bool);

    function initializeLendingMarket(
        bytes32 ccy,
        uint256 genesisDate,
        uint256 compoundFactor,
        uint256 orderFeeRate,
        uint256 circuitBreakerLimitRange
    ) external;

    function createLendingMarket(bytes32 ccy, uint256 marketOpeningDate) external;

    function executeOrder(
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    ) external returns (bool);

    function depositAndExecuteOrder(
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    ) external payable returns (bool);

    function executePreOrder(
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    ) external returns (bool);

    function depositAndExecutesPreOrder(
        bytes32 ccy,
        uint256 maturity,
        ProtocolTypes.Side side,
        uint256 amount,
        uint256 unitPrice
    ) external payable returns (bool);

    function unwindPosition(bytes32 ccy, uint256 maturity) external returns (bool);

    function executeItayoseCalls(bytes32[] memory currencies, uint256 maturity)
        external
        returns (bool);

    function executeRedemption(bytes32 _ccy, uint256 _maturity) external returns (bool);

    function executeRepayment(bytes32 _ccy, uint256 _maturity) external returns (bool);

    function executeEmergencySettlement() external returns (bool);

    function executeLiquidationCall(
        bytes32 collateralCcy,
        bytes32 debtCcy,
        uint256 debtMaturity,
        address user
    ) external returns (bool);

    function executeForcedRepayment(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    ) external returns (bool);

    function cancelOrder(
        bytes32 ccy,
        uint256 maturity,
        uint48 orderId
    ) external returns (bool);

    function rotateLendingMarkets(bytes32 ccy) external;

    function executeEmergencyTermination() external;

    function pauseLendingMarkets(bytes32 ccy) external returns (bool);

    function unpauseLendingMarkets(bytes32 ccy) external returns (bool);

    function cleanUpAllFunds(address user) external returns (bool);

    function cleanUpFunds(bytes32 ccy, address user) external returns (uint256 activeOrderCount);
}
