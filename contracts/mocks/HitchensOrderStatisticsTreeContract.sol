// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../libraries/HitchensOrderStatisticsTreeLib.sol";

contract HitchensOrderStatisticsTreeContract {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    HitchensOrderStatisticsTreeLib.Tree tree;

    event InsertOrder(string action, uint256 amount, uint256 value, uint256 orderId);
    event RemoveOrder(string action, uint256 value, uint256 _id);

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

    function amountValueExists(uint256 amount, uint256 value) public view returns (bool _exists) {
        _exists = tree.amountExistsInNode(amount, value);
    }

    function getNode(uint256 value)
        public
        view
        returns (
            uint256 _parent,
            uint256 _left,
            uint256 _right,
            bool _red,
            uint256 _head,
            uint256 _tail,
            uint256 _orderCounter
        )
    {
        (_parent, _left, _right, _red, _head, _tail, _orderCounter) = tree.getNode(value);
    }

    function getOrderByID(uint256 value, uint48 orderOd) public view returns (OrderItem memory) {
        return tree.getOrderById(value, orderOd);
    }

    function getRootCount() public view returns (uint256 _orderCounter) {
        _orderCounter = tree.count();
    }

    function getValueCount(uint256 value) public view returns (uint256 _orderCounter) {
        _orderCounter = tree.getNodeCount(value);
    }

    function insertAmountValue(
        uint256 value,
        uint48 orderId,
        address user,
        uint256 amount
    ) public {
        emit InsertOrder("insert", amount, value, orderId);
        tree.insertOrder(value, orderId, user, amount, false);
    }

    function removeAmountValue(uint256 value, uint48 orderId) public {
        emit RemoveOrder("delete", value, orderId);
        tree.removeOrder(value, orderId);
    }
}
