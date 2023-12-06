// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../../protocol/libraries/OrderStatisticsTreeLib.sol";

contract OrderStatisticsTreeContract {
    using OrderStatisticsTreeLib for OrderStatisticsTreeLib.Tree;

    OrderStatisticsTreeLib.Tree tree;

    event OrderInserted(string action, uint256 amount, uint256 value, uint256 orderId);
    event OrderRemoved(string action, uint256 value, uint256 _id);

    event Drop(
        uint256 droppedAmount,
        uint256 droppedAmountInFV,
        uint256 removedOrderAmount,
        uint256 removedOrderAmountInFV
    );

    constructor() {}

    function treeRootNode() public view returns (uint256 _value) {
        _value = tree.root;
    }

    function firstValue() public view returns (uint256 _value) {
        _value = tree.first();
    }

    function lastValue() public view returns (uint256 _value) {
        _value = tree.last();
    }

    function nextValue(uint256 value) public view returns (uint256 _value) {
        _value = tree.next(value);
    }

    function prevValue(uint256 value) public view returns (uint256 _value) {
        _value = tree.prev(value);
    }

    function valueExists(uint256 value) public view returns (bool _exists) {
        _exists = tree.exists(value);
    }

    function getNode(
        uint256 value
    )
        public
        view
        returns (
            uint256 _parent,
            uint256 _left,
            uint256 _right,
            bool _red,
            uint256 _head,
            uint256 _tail,
            uint256 _orderCounter,
            uint256 _orderTotalAmount
        )
    {
        (_parent, _left, _right, _red, _head, _tail, _orderCounter, _orderTotalAmount) = tree
            .getNode(value);
    }

    function getOrderById(
        uint256 value,
        uint48 orderId
    ) public view returns (address maker, uint256 amount) {
        return tree.getOrderById(value, orderId);
    }

    function getRootCount() public view returns (uint256 _orderCounter) {
        _orderCounter = tree.count();
    }

    function getValueCount(uint256 value) public view returns (uint256 _orderCounter) {
        _orderCounter = tree.getNodeCount(value);
    }

    function insertAmountValue(uint256 value, uint48 orderId, address user, uint256 amount) public {
        emit OrderInserted("insert", amount, value, orderId);
        tree.insertOrder(value, orderId, user, amount);
    }

    function removeAmountValue(uint256 value, uint48 orderId) public {
        emit OrderRemoved("delete", value, orderId);
        tree.removeOrder(value, orderId);
    }

    function calculateDroppedAmountFromLeft(
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue
    ) public view returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV) {
        return tree.calculateDroppedAmountFromLeft(amount, amountInFV, limitValue);
    }

    function calculateDroppedAmountFromRight(
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue
    ) public view returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV) {
        return tree.calculateDroppedAmountFromRight(amount, amountInFV, limitValue);
    }

    function dropValuesFromFirst(uint256 value, uint256 amountInFV, uint256 limitValue) public {
        (
            ,
            uint256 droppedAmount,
            uint256 droppedAmountInFV,
            ,
            PartiallyRemovedOrder memory partiallyRemovedOrder
        ) = tree.dropLeft(value, amountInFV, limitValue);
        emit Drop(
            droppedAmount,
            droppedAmountInFV,
            partiallyRemovedOrder.amount,
            partiallyRemovedOrder.futureValue
        );
    }

    function dropValuesFromLast(uint256 amount, uint256 amountInFV, uint256 limitValue) public {
        (
            ,
            uint256 droppedAmount,
            uint256 droppedAmountInFV,
            ,
            PartiallyRemovedOrder memory partiallyRemovedOrder
        ) = tree.dropRight(amount, amountInFV, limitValue);
        emit Drop(
            droppedAmount,
            droppedAmountInFV,
            partiallyRemovedOrder.amount,
            partiallyRemovedOrder.futureValue
        );
    }
}
