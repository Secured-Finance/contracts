// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ProtocolTypes} from "../types/ProtocolTypes.sol";
import {HitchensOrderStatisticsTreeLib} from "../libraries/HitchensOrderStatisticsTreeLib.sol";
import {OrderManagerStorage as Storage} from "../storages/OrderManagerStorage.sol";

contract MixinOrderManager {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    function isTakenLendOrder(
        uint256 _timestamp,
        uint256 _rate,
        uint48 _orderId
    ) internal view returns (bool) {
        if (Storage.slot().historicalTakenBorrowOrders.root == 0) {
            return false;
        }

        uint256 cursor = Storage.slot().historicalTakenBorrowOrders.root;
        uint256 probe = Storage.slot().historicalExecutedBorrowRates[cursor];
        bool isOrderIdExists = Storage.slot().historicalTakenBorrowOrders.isOrderIdExists(
            _timestamp,
            _orderId
        );

        uint256 left;
        uint256 right;

        while (cursor != 0 && probe >= _rate && !isOrderIdExists) {
            (, left, right, , , , , ) = Storage.slot().historicalTakenBorrowOrders.getNode(cursor);
            if (left != 0 && _timestamp < left) {
                cursor = left;
                probe = Storage.slot().historicalExecutedBorrowRates[cursor];
            } else if (right != 0 && _timestamp > right) {
                cursor = right;
                probe = Storage.slot().historicalExecutedBorrowRates[right];
            } else {
                break;
            }
        }

        return probe >= _rate && !isOrderIdExists;
    }

    function isTakenBorrowOrder(
        uint256 _timestamp,
        uint256 _rate,
        uint48 _orderId
    ) internal view returns (bool) {
        if (Storage.slot().historicalTakenLendOrders.root == 0) {
            return false;
        }

        uint256 cursor = Storage.slot().historicalTakenLendOrders.root;
        uint256 probe = Storage.slot().historicalExecutedLendRates[cursor];
        bool isOrderIdExists = Storage.slot().historicalTakenLendOrders.isOrderIdExists(
            _timestamp,
            _orderId
        );

        uint256 left;
        uint256 right;

        while (cursor != 0 && probe <= _rate && !isOrderIdExists) {
            (, left, right, , , , , ) = Storage.slot().historicalTakenLendOrders.getNode(cursor);
            if (left != 0 && _timestamp < left) {
                cursor = left;
                probe = Storage.slot().historicalExecutedLendRates[cursor];
            } else if (right != 0 && _timestamp > right) {
                cursor = right;
                probe = Storage.slot().historicalExecutedLendRates[right];
            } else {
                break;
            }
        }

        return probe <= _rate && !isOrderIdExists;
    }

    function updateOrderHistory(ProtocolTypes.Side _side, uint256 _rate) internal {
        if (_side == ProtocolTypes.Side.LEND) {
            uint256 lastTimestamp = Storage.slot().historicalTakenLendOrders.last();
            uint256 lastRate = Storage.slot().historicalExecutedLendRates[lastTimestamp];

            if (lastRate >= _rate) {
                Storage.slot().historicalTakenLendOrders.remove(lastTimestamp);
            }

            Storage.slot().historicalTakenLendOrders.insert(block.timestamp);
            Storage.slot().historicalExecutedLendRates[block.timestamp] = _rate;
            uint48[] memory orderIds = Storage.slot().historicalTakenLendOrders.getNodeOrderIds(
                block.timestamp
            );

            for (uint256 i = 0; i < orderIds.length; i++) {
                Storage.slot().historicalTakenLendOrders.addHead(
                    block.timestamp,
                    orderIds[i],
                    address(0),
                    0
                );
            }
        } else {
            uint256 lastTimestamp = Storage.slot().historicalTakenBorrowOrders.last();
            uint256 lastRate = Storage.slot().historicalExecutedBorrowRates[lastTimestamp];

            if (lastRate >= _rate) {
                Storage.slot().historicalTakenBorrowOrders.remove(lastTimestamp);
            }

            Storage.slot().historicalTakenBorrowOrders.insert(block.timestamp);
            Storage.slot().historicalExecutedBorrowRates[block.timestamp] = _rate;
            uint48[] memory orderIds = Storage.slot().historicalTakenBorrowOrders.getNodeOrderIds(
                block.timestamp
            );

            for (uint256 i = 0; i < orderIds.length; i++) {
                Storage.slot().historicalTakenBorrowOrders.addHead(
                    block.timestamp,
                    orderIds[i],
                    address(0),
                    0
                );
            }
        }
    }
}
