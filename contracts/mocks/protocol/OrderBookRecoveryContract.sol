// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import {OrderBookLib, PlacedOrder, IncidentResidualOrder} from "../../protocol/libraries/OrderBookLib.sol";
import {OrderStatisticsTreeLib} from "../../protocol/libraries/OrderStatisticsTreeLib.sol";
import {ProtocolTypes} from "../../protocol/types/ProtocolTypes.sol";

struct IncidentTreeNode {
    uint256 parent;
    uint256 left;
    uint256 right;
    bool red;
    uint48 head;
    uint48 tail;
    uint256 orderCounter;
    uint256 orderTotalAmount;
    uint32 firstChunkId;
    uint32 lastChunkId;
    uint32 lastAllocatedChunkId;
    uint48 explicitMappingStartOrderId;
    uint32 activeChunkCount;
}

contract OrderBookRecoveryContract {
    using OrderBookLib for OrderBookLib.OrderBook;

    OrderBookLib.OrderBook private orderBook;

    function initialize(uint256 _maturity) external {
        orderBook.initialize(_maturity, block.timestamp + 8 days, block.timestamp + 1 days);
    }

    function placeOrder(
        ProtocolTypes.Side _side,
        address _maker,
        uint256 _amount,
        uint256 _unitPrice
    ) external returns (uint48 orderId) {
        return orderBook.placeOrder(_side, _maker, _amount, _unitPrice);
    }

    function clearActiveOrderIds(ProtocolTypes.Side _side, address _maker) external {
        if (_side == ProtocolTypes.Side.LEND) {
            delete orderBook.activeLendOrderIds[_maker];
        } else {
            delete orderBook.activeBorrowOrderIds[_maker];
        }
    }

    function setEmptyNode(ProtocolTypes.Side _side, IncidentTreeNode calldata _state) external {
        OrderStatisticsTreeLib.Tree storage tree = _tree(_side);
        OrderStatisticsTreeLib.Node storage node = tree.nodes[0];
        node.parent = _state.parent;
        node.left = _state.left;
        node.right = _state.right;
        node.red = _state.red;
        node.head = _state.head;
        node.tail = _state.tail;
        node.orderCounter = _state.orderCounter;
        node.orderTotalAmount = _state.orderTotalAmount;

        OrderStatisticsTreeLib.PriceChunkMetadata storage metadata = tree.chunkMetadata[0];
        metadata.firstChunkId = _state.firstChunkId;
        metadata.lastChunkId = _state.lastChunkId;
        metadata.lastAllocatedChunkId = _state.lastAllocatedChunkId;
        metadata.explicitMappingStartOrderId = _state.explicitMappingStartOrderId;
        metadata.activeChunkCount = _state.activeChunkCount;
    }

    function recoverIncidentResidualOrders(
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _expectedRoot,
        IncidentResidualOrder[] calldata _orders
    ) external {
        orderBook.recoverIncidentResidualOrders(_maturity, _side, _expectedRoot, _orders);
    }

    function getRoot(ProtocolTypes.Side _side) external view returns (uint256) {
        return _tree(_side).root;
    }

    function getNode(
        ProtocolTypes.Side _side,
        uint256 _unitPrice
    ) external view returns (IncidentTreeNode memory state) {
        OrderStatisticsTreeLib.Tree storage tree = _tree(_side);
        OrderStatisticsTreeLib.Node storage node = tree.nodes[_unitPrice];
        OrderStatisticsTreeLib.PriceChunkMetadata storage metadata = tree.chunkMetadata[_unitPrice];
        state = IncidentTreeNode(
            node.parent,
            node.left,
            node.right,
            node.red,
            node.head,
            node.tail,
            node.orderCounter,
            node.orderTotalAmount,
            metadata.firstChunkId,
            metadata.lastChunkId,
            metadata.lastAllocatedChunkId,
            metadata.explicitMappingStartOrderId,
            metadata.activeChunkCount
        );
    }

    function getPlacedOrder(uint48 _orderId) external view returns (PlacedOrder memory) {
        return orderBook.getOrder(_orderId);
    }

    function getTreeOrder(
        ProtocolTypes.Side _side,
        uint256 _unitPrice,
        uint48 _orderId
    ) external view returns (OrderStatisticsTreeLib.OrderItem memory) {
        return _tree(_side).nodes[_unitPrice].orders[_orderId];
    }

    function getActiveOrderCount(
        ProtocolTypes.Side _side,
        address _maker
    ) external view returns (uint256) {
        return
            _side == ProtocolTypes.Side.LEND
                ? orderBook.activeLendOrderIds[_maker].length
                : orderBook.activeBorrowOrderIds[_maker].length;
    }

    function _tree(
        ProtocolTypes.Side _side
    ) private view returns (OrderStatisticsTreeLib.Tree storage tree) {
        return
            _side == ProtocolTypes.Side.LEND
                ? orderBook.lendOrders[orderBook.maturity]
                : orderBook.borrowOrders[orderBook.maturity];
    }
}
