// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "../../../dependencies/openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/contracts/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketUserLogic {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeCast for int256;

    function unwind(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        int256 _futureValue
    )
        external
        returns (
            uint256 filledUnitPrice,
            uint256 filledAmount,
            uint256 filledFutureValue,
            ILendingMarket.PartiallyFilledOrder memory partiallyFilledOrder,
            ProtocolTypes.Side side
        )
    {
        require(_futureValue != 0, "Future Value is zero");

        if (_futureValue > 0) {
            side = ProtocolTypes.Side.BORROW;
            (
                filledUnitPrice,
                filledAmount,
                filledFutureValue,
                partiallyFilledOrder
            ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).unwind(
                side,
                _user,
                _futureValue.toUint256()
            );
        } else if (_futureValue < 0) {
            side = ProtocolTypes.Side.LEND;
            (
                filledUnitPrice,
                filledAmount,
                filledFutureValue,
                partiallyFilledOrder
            ) = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity]).unwind(
                side,
                _user,
                (-_futureValue).toUint256()
            );
        }
    }

    function getOrders(bytes32[] memory _ccys, address _user)
        external
        view
        returns (
            ILendingMarketController.Order[] memory activeOrders,
            ILendingMarketController.Order[] memory inactiveOrders
        )
    {
        uint256 totalActiveOrderCount;
        uint256 totalInactiveOrderCount;

        ILendingMarketController.Order[][]
            memory activeOrdersList = new ILendingMarketController.Order[][](_ccys.length);
        ILendingMarketController.Order[][]
            memory inactiveOrdersList = new ILendingMarketController.Order[][](_ccys.length);

        for (uint256 i; i < _ccys.length; i++) {
            (activeOrdersList[i], inactiveOrdersList[i]) = _getOrdersPerCurrency(_ccys[i], _user);
            totalActiveOrderCount += activeOrdersList[i].length;
            totalInactiveOrderCount += inactiveOrdersList[i].length;
        }

        activeOrders = _flattenOrders(activeOrdersList, totalActiveOrderCount);
        inactiveOrders = _flattenOrders(inactiveOrdersList, totalInactiveOrderCount);
    }

    function _getOrdersPerCurrency(bytes32 _ccy, address _user)
        internal
        view
        returns (
            ILendingMarketController.Order[] memory activeOrders,
            ILendingMarketController.Order[] memory inactiveOrders
        )
    {
        uint256 totalActiveOrderCount;
        uint256 totalInactiveOrderCount;

        uint256[] memory maturities = Storage.slot().usedMaturities[_ccy][_user].values();
        ILendingMarketController.Order[][]
            memory activeOrdersList = new ILendingMarketController.Order[][](maturities.length);
        ILendingMarketController.Order[][]
            memory inactiveOrdersList = new ILendingMarketController.Order[][](maturities.length);

        for (uint256 i; i < maturities.length; i++) {
            (activeOrdersList[i], inactiveOrdersList[i]) = _getOrdersPerMarket(
                _ccy,
                maturities[i],
                _user
            );
            totalActiveOrderCount += activeOrdersList[i].length;
            totalInactiveOrderCount += inactiveOrdersList[i].length;
        }

        activeOrders = _flattenOrders(activeOrdersList, totalActiveOrderCount);
        inactiveOrders = _flattenOrders(inactiveOrdersList, totalInactiveOrderCount);
    }

    function _getOrdersPerMarket(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    )
        internal
        view
        returns (
            ILendingMarketController.Order[] memory activeOrders,
            ILendingMarketController.Order[] memory inactiveOrders
        )
    {
        ILendingMarket market = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        );

        (uint48[] memory activeLendOrderIds, uint48[] memory inActiveLendOrderIds) = market
            .getLendOrderIds(_user);
        (uint48[] memory activeBorrowOrderIds, uint48[] memory inActiveBorrowOrderIds) = market
            .getBorrowOrderIds(_user);

        activeOrders = new ILendingMarketController.Order[](
            activeLendOrderIds.length + activeBorrowOrderIds.length
        );
        inactiveOrders = new ILendingMarketController.Order[](
            inActiveLendOrderIds.length + inActiveBorrowOrderIds.length
        );

        for (uint256 i; i < activeLendOrderIds.length; i++) {
            activeOrders[i] = _getOrder(_ccy, market, activeLendOrderIds[i]);
        }

        for (uint256 i; i < activeBorrowOrderIds.length; i++) {
            activeOrders[activeLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                activeBorrowOrderIds[i]
            );
        }

        for (uint256 i; i < inActiveLendOrderIds.length; i++) {
            inactiveOrders[i] = _getOrder(_ccy, market, inActiveLendOrderIds[i]);
        }

        for (uint256 i; i < inActiveBorrowOrderIds.length; i++) {
            inactiveOrders[inActiveLendOrderIds.length + i] = _getOrder(
                _ccy,
                market,
                inActiveBorrowOrderIds[i]
            );
        }
    }

    function _getOrder(
        bytes32 _ccy,
        ILendingMarket _market,
        uint48 _orderId
    ) internal view returns (ILendingMarketController.Order memory order) {
        (
            ProtocolTypes.Side side,
            uint256 unitPrice,
            uint256 maturity,
            ,
            uint256 amount,
            uint256 timestamp
        ) = _market.getOrder(_orderId);

        order = ILendingMarketController.Order(
            _orderId,
            _ccy,
            maturity,
            side,
            unitPrice,
            amount,
            timestamp
        );
    }

    function _flattenOrders(ILendingMarketController.Order[][] memory orders, uint256 totalLength)
        internal
        pure
        returns (ILendingMarketController.Order[] memory flattened)
    {
        flattened = new ILendingMarketController.Order[](totalLength);
        uint256 index;
        for (uint256 i; i < orders.length; i++) {
            for (uint256 j; j < orders[i].length; j++) {
                flattened[index] = orders[i][j];
                index++;
            }
        }
    }
}
