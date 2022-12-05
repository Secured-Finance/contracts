// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// types
import {ProtocolTypes} from "../types/ProtocolTypes.sol";

struct RemainingOrder {
    uint48 orderId;
    address maker;
    uint256 amount;
    uint256 unitPrice;
}

struct OrderItem {
    uint48 orderId;
    uint48 next;
    uint48 prev;
    address maker;
    uint256 timestamp;
    uint256 amount;
}

/**
 * @notice HitchensOrderStatisticsTreeLib is a Red-Black Tree binary search library
 * based on the following library that is extended to manage order data.
 *
 * https://github.com/rob-Hitchens/OrderStatisticsTree
 *
 */
library HitchensOrderStatisticsTreeLib {
    uint256 private constant EMPTY = 0;

    struct Node {
        uint256 parent;
        uint256 left;
        uint256 right;
        bool red;
        uint48 head;
        uint48 tail;
        uint256 orderCounter;
        uint256 orderTotalAmount;
        mapping(uint256 => OrderItem) orders;
    }

    struct Tree {
        uint256 root;
        mapping(uint256 => Node) nodes;
    }

    function first(Tree storage self) internal view returns (uint256 _value) {
        _value = self.root;
        if (_value == EMPTY) return 0;
        while (self.nodes[_value].left != EMPTY) {
            _value = self.nodes[_value].left;
        }
    }

    function last(Tree storage self) internal view returns (uint256 _value) {
        _value = self.root;
        if (_value == EMPTY) return 0;
        while (self.nodes[_value].right != EMPTY) {
            _value = self.nodes[_value].right;
        }
    }

    function next(Tree storage self, uint256 value) internal view returns (uint256 _cursor) {
        require(value != EMPTY, "OrderStatisticsTree(401) - Starting value cannot be zero");
        if (self.nodes[value].right != EMPTY) {
            _cursor = treeMinimum(self, self.nodes[value].right);
        } else {
            _cursor = self.nodes[value].parent;
            while (_cursor != EMPTY && value == self.nodes[_cursor].right) {
                value = _cursor;
                _cursor = self.nodes[_cursor].parent;
            }
        }
    }

    function prev(Tree storage self, uint256 value) internal view returns (uint256 _cursor) {
        require(value != EMPTY, "OrderStatisticsTree(402) - Starting value cannot be zero");
        if (self.nodes[value].left != EMPTY) {
            _cursor = treeMaximum(self, self.nodes[value].left);
        } else {
            _cursor = self.nodes[value].parent;
            while (_cursor != EMPTY && value == self.nodes[_cursor].left) {
                value = _cursor;
                _cursor = self.nodes[_cursor].parent;
            }
        }
    }

    function exists(Tree storage self, uint256 value) internal view returns (bool _exists) {
        if (value == EMPTY) return false;
        if (value == self.root) return true;
        // if (self.nodes[value].parent != EMPTY) return true;
        uint256 cursor = value;
        while (self.nodes[cursor].parent != EMPTY) {
            uint256 parent = self.nodes[cursor].parent;
            if (self.nodes[parent].left != cursor && self.nodes[parent].right != cursor) {
                return false;
            }
            if (parent == self.root) {
                return true;
            }
            cursor = self.nodes[cursor].parent;
        }
        return false;
    }

    function isActiveOrderId(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal view returns (bool) {
        return orderIdExists(self, value, orderId) && exists(self, value);
    }

    function getNode(Tree storage self, uint256 value)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        require(exists(self, value), "OrderStatisticsTree(403) - Value does not exist.");
        Node storage gn = self.nodes[value];
        return (
            gn.parent,
            gn.left,
            gn.right,
            gn.red,
            gn.head,
            gn.tail,
            gn.orderCounter,
            gn.orderTotalAmount
        );
    }

    function getNodeCount(Tree storage self, uint256 value) internal view returns (uint256) {
        Node storage gn = self.nodes[value];
        return gn.orderCounter;
    }

    function getNodeTotalAmount(Tree storage self, uint256 value)
        internal
        view
        returns (uint256 totalAmount)
    {
        return self.nodes[value].orderTotalAmount;
    }

    function getNodeOrderIds(Tree storage self, uint256 value)
        internal
        view
        returns (uint48[] memory orderIds)
    {
        Node storage gn = self.nodes[value];
        OrderItem memory order = gn.orders[gn.head];
        orderIds = new uint48[](gn.orderCounter);

        for (uint256 i = 0; i < gn.orderCounter; i++) {
            orderIds[i] = order.orderId;
            order = gn.orders[order.next];
        }
    }

    function count(Tree storage self) internal view returns (uint256 _count) {
        return getNodeCount(self, self.root);
    }

    function insert(Tree storage self, uint256 value) internal {
        require(value != EMPTY, "OrderStatisticsTree(405) - Value to insert cannot be zero");
        uint256 cursor;
        uint256 probe = self.root;
        while (probe != EMPTY) {
            cursor = probe;
            if (value < probe) {
                probe = self.nodes[probe].left;
            } else if (value > probe) {
                probe = self.nodes[probe].right;
            } else if (value == probe) {
                return;
            }
        }

        Node storage nValue = self.nodes[value];
        // Update order info as a new one if there is already an old node
        if (
            self.root == EMPTY ||
            (self.nodes[cursor].left != value && self.nodes[cursor].right != value)
        ) {
            nValue.orderCounter = 0;
            nValue.orderTotalAmount = 0;
            _setHead(self, value, 0);
            _setTail(self, value, 0);
        }
        nValue.parent = cursor;
        nValue.left = EMPTY;
        nValue.right = EMPTY;
        nValue.red = true;

        if (cursor == EMPTY) {
            self.root = value;
        } else if (value < cursor) {
            self.nodes[cursor].left = value;
        } else {
            self.nodes[cursor].right = value;
        }
        insertFixup(self, value);
    }

    function remove(Tree storage self, uint256 value) internal {
        require(value != EMPTY, "OrderStatisticsTree(407) - Value to delete cannot be zero");
        Node storage nValue = self.nodes[value];
        uint256 probe;
        uint256 cursor;
        if (nValue.orderCounter == 0) {
            if (self.nodes[value].left == EMPTY || self.nodes[value].right == EMPTY) {
                cursor = value;
            } else {
                cursor = self.nodes[value].right;
                while (self.nodes[cursor].left != EMPTY) {
                    cursor = self.nodes[cursor].left;
                }
            }
            if (self.nodes[cursor].left != EMPTY) {
                probe = self.nodes[cursor].left;
            } else {
                probe = self.nodes[cursor].right;
            }
            uint256 cursorParent = self.nodes[cursor].parent;
            self.nodes[probe].parent = cursorParent;
            if (cursorParent != EMPTY) {
                if (cursor == self.nodes[cursorParent].left) {
                    self.nodes[cursorParent].left = probe;
                } else {
                    self.nodes[cursorParent].right = probe;
                }
            } else {
                self.root = probe;
            }
            bool doFixup = !self.nodes[cursor].red;
            if (cursor != value) {
                replaceParent(self, cursor, value);
                self.nodes[cursor].left = self.nodes[value].left;
                self.nodes[self.nodes[cursor].left].parent = cursor;
                self.nodes[cursor].right = self.nodes[value].right;
                self.nodes[self.nodes[cursor].right].parent = cursor;
                self.nodes[cursor].red = self.nodes[value].red;
                (cursor, value) = (value, cursor);
            }
            if (doFixup) {
                removeFixup(self, probe);
            }
            delete self.nodes[cursor];
        }
    }

    function treeMinimum(Tree storage self, uint256 value) private view returns (uint256) {
        while (self.nodes[value].left != EMPTY) {
            value = self.nodes[value].left;
        }
        return value;
    }

    function treeMaximum(Tree storage self, uint256 value) private view returns (uint256) {
        while (self.nodes[value].right != EMPTY) {
            value = self.nodes[value].right;
        }
        return value;
    }

    function rotateLeft(Tree storage self, uint256 value) private {
        uint256 cursor = self.nodes[value].right;
        uint256 parent = self.nodes[value].parent;
        uint256 cursorLeft = self.nodes[cursor].left;
        self.nodes[value].right = cursorLeft;
        if (cursorLeft != EMPTY) {
            self.nodes[cursorLeft].parent = value;
        }
        self.nodes[cursor].parent = parent;
        if (parent == EMPTY) {
            self.root = cursor;
        } else if (value == self.nodes[parent].left) {
            self.nodes[parent].left = cursor;
        } else {
            self.nodes[parent].right = cursor;
        }
        self.nodes[cursor].left = value;
        self.nodes[value].parent = cursor;
    }

    function rotateRight(Tree storage self, uint256 value) private {
        uint256 cursor = self.nodes[value].left;
        uint256 parent = self.nodes[value].parent;
        uint256 cursorRight = self.nodes[cursor].right;
        self.nodes[value].left = cursorRight;
        if (cursorRight != EMPTY) {
            self.nodes[cursorRight].parent = value;
        }
        self.nodes[cursor].parent = parent;
        if (parent == EMPTY) {
            self.root = cursor;
        } else if (value == self.nodes[parent].right) {
            self.nodes[parent].right = cursor;
        } else {
            self.nodes[parent].left = cursor;
        }
        self.nodes[cursor].right = value;
        self.nodes[value].parent = cursor;
    }

    function insertFixup(Tree storage self, uint256 value) private {
        uint256 cursor;
        while (value != self.root && self.nodes[self.nodes[value].parent].red) {
            uint256 valueParent = self.nodes[value].parent;
            if (valueParent == self.nodes[self.nodes[valueParent].parent].left) {
                cursor = self.nodes[self.nodes[valueParent].parent].right;
                if (self.nodes[cursor].red) {
                    self.nodes[valueParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    value = self.nodes[valueParent].parent;
                } else {
                    if (value == self.nodes[valueParent].right) {
                        value = valueParent;
                        rotateLeft(self, value);
                    }
                    valueParent = self.nodes[value].parent;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    rotateRight(self, self.nodes[valueParent].parent);
                }
            } else {
                cursor = self.nodes[self.nodes[valueParent].parent].left;
                if (self.nodes[cursor].red) {
                    self.nodes[valueParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    value = self.nodes[valueParent].parent;
                } else {
                    if (value == self.nodes[valueParent].left) {
                        value = valueParent;
                        rotateRight(self, value);
                    }
                    valueParent = self.nodes[value].parent;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    rotateLeft(self, self.nodes[valueParent].parent);
                }
            }
        }
        self.nodes[self.root].red = false;
    }

    function replaceParent(
        Tree storage self,
        uint256 a,
        uint256 b
    ) private {
        uint256 bParent = self.nodes[b].parent;
        self.nodes[a].parent = bParent;
        if (bParent == EMPTY) {
            self.root = a;
        } else {
            if (b == self.nodes[bParent].left) {
                self.nodes[bParent].left = a;
            } else {
                self.nodes[bParent].right = a;
            }
        }
    }

    function removeFixup(Tree storage self, uint256 value) private {
        uint256 cursor;
        while (value != self.root && !self.nodes[value].red) {
            uint256 valueParent = self.nodes[value].parent;
            if (value == self.nodes[valueParent].left) {
                cursor = self.nodes[valueParent].right;
                if (self.nodes[cursor].red) {
                    self.nodes[cursor].red = false;
                    self.nodes[valueParent].red = true;
                    rotateLeft(self, valueParent);
                    cursor = self.nodes[valueParent].right;
                }
                if (
                    !self.nodes[self.nodes[cursor].left].red &&
                    !self.nodes[self.nodes[cursor].right].red
                ) {
                    self.nodes[cursor].red = true;
                    value = valueParent;
                } else {
                    if (!self.nodes[self.nodes[cursor].right].red) {
                        self.nodes[self.nodes[cursor].left].red = false;
                        self.nodes[cursor].red = true;
                        rotateRight(self, cursor);
                        cursor = self.nodes[valueParent].right;
                    }
                    self.nodes[cursor].red = self.nodes[valueParent].red;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[cursor].right].red = false;
                    rotateLeft(self, valueParent);
                    value = self.root;
                }
            } else {
                cursor = self.nodes[valueParent].left;
                if (self.nodes[cursor].red) {
                    self.nodes[cursor].red = false;
                    self.nodes[valueParent].red = true;
                    rotateRight(self, valueParent);
                    cursor = self.nodes[valueParent].left;
                }
                if (
                    !self.nodes[self.nodes[cursor].right].red &&
                    !self.nodes[self.nodes[cursor].left].red
                ) {
                    self.nodes[cursor].red = true;
                    value = valueParent;
                } else {
                    if (!self.nodes[self.nodes[cursor].left].red) {
                        self.nodes[self.nodes[cursor].right].red = false;
                        self.nodes[cursor].red = true;
                        rotateLeft(self, cursor);
                        cursor = self.nodes[valueParent].left;
                    }
                    self.nodes[cursor].red = self.nodes[valueParent].red;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[cursor].left].red = false;
                    rotateRight(self, valueParent);
                    value = self.root;
                }
            }
        }
        self.nodes[value].red = false;
    }

    function estimateDroppedAmountFromLeft(Tree storage self, uint256 targetFutureValue)
        internal
        view
        returns (uint256 droppedAmount)
    {
        uint256 cursor = first(self);
        uint256 totalDroppedAmountInFV = 0;
        droppedAmount = 0;

        // Find a node whose total amount is over the amount of the argument.
        while (totalDroppedAmountInFV < targetFutureValue && cursor != EMPTY) {
            uint256 cursorNodeAmountInPV = self.nodes[cursor].orderTotalAmount;

            uint256 cursorNodeAmountInFV = _calculateFutureValue(cursor, cursorNodeAmountInPV);
            totalDroppedAmountInFV += cursorNodeAmountInFV;

            if (totalDroppedAmountInFV > targetFutureValue) {
                uint256 filledAmountInFV = cursorNodeAmountInFV -
                    (totalDroppedAmountInFV - targetFutureValue);
                droppedAmount += (cursorNodeAmountInPV * filledAmountInFV) / cursorNodeAmountInFV;
            } else {
                droppedAmount += cursorNodeAmountInPV;
            }

            cursor = next(self, cursor);
        }
    }

    function estimateDroppedAmountFromRight(Tree storage self, uint256 targetFutureValue)
        internal
        view
        returns (uint256 droppedAmount)
    {
        uint256 cursor = last(self);
        uint256 totalDroppedAmountInFV = 0;
        droppedAmount = 0;

        // Find a node whose total amount is over the amount of the argument.
        while (totalDroppedAmountInFV < targetFutureValue && cursor != EMPTY) {
            uint256 cursorNodeAmountInPV = self.nodes[cursor].orderTotalAmount;

            uint256 cursorNodeAmountInFV = _calculateFutureValue(cursor, cursorNodeAmountInPV);
            totalDroppedAmountInFV += cursorNodeAmountInFV;

            if (totalDroppedAmountInFV > targetFutureValue) {
                uint256 filledAmountInFV = cursorNodeAmountInFV -
                    (totalDroppedAmountInFV - targetFutureValue);
                droppedAmount += (cursorNodeAmountInPV * filledAmountInFV) / cursorNodeAmountInFV;
            } else {
                droppedAmount += cursorNodeAmountInPV;
            }

            cursor = prev(self, cursor);
        }
    }

    // function estimateDroppedFVAmountFromLeft(
    //     Tree storage self,
    //     uint256 targetAmount,
    //     uint256 limitValue
    // )
    //     internal
    //     view
    //     returns (
    //         uint256 droppedAmountInFV,
    //         uint256 cursor,
    //         uint256 probe,
    //         uint256 rootNodeAmount,
    //         uint256 totalAmount
    //     )
    // {
    //     probe = first(self);
    //     rootNodeAmount = 0;
    //     totalAmount = 0;

    //     while (
    //         totalAmount < targetAmount && probe != EMPTY && (limitValue == 0 || probe <= limitValue)
    //     ) {
    //         rootNodeAmount = self.nodes[probe].orderTotalAmount;
    //         totalAmount += rootNodeAmount;
    //         cursor = probe;

    //         uint256 filledAmount = rootNodeAmount -
    //             (totalAmount > targetAmount ? totalAmount - targetAmount : 0);
    //         droppedAmountInFV += _calculateFutureValue(probe, filledAmount);

    //         probe = next(self, probe);
    //     }
    // }

    function dropLeft(
        Tree storage self,
        uint256 amount,
        uint256 limitValue
    )
        internal
        returns (
            uint256 filledFutureValue,
            uint256 remainingAmount,
            RemainingOrder memory remainingOrder
        )
    {
        require(amount != EMPTY, "OrderStatisticsTree(408) - Amount to drop cannot be zero");
        uint256 value;
        uint256 cursor = first(self);
        uint256 lastNode = last(self);
        uint256 cursorNodeAmount = 0;
        uint256 totalAmount = 0;

        require(cursor <= limitValue || limitValue == 0, "Insufficient limit value");

        // Find a node whose total amount is over the amount of the argument.
        while (
            totalAmount < amount && cursor != EMPTY && (limitValue == 0 || cursor <= limitValue)
        ) {
            cursorNodeAmount = self.nodes[cursor].orderTotalAmount;
            totalAmount += cursorNodeAmount;
            value = cursor;

            uint256 filledAmount = cursorNodeAmount -
                (totalAmount > amount ? totalAmount - amount : 0);
            filledFutureValue += _calculateFutureValue(cursor, filledAmount);

            cursor = next(self, cursor);
        }
        // (
        //     filledFutureValue,
        //     value,
        //     cursor,
        //     cursorNodeAmount,
        //     totalAmount
        // ) = estimateDroppedFVAmountFromLeft(self, amount, limitValue);

        if (totalAmount >= amount || value == limitValue) {
            if (totalAmount > amount) {
                cursor = value;
                // Update order ids in the node.
                uint256 filledNodeAmount = cursorNodeAmount - (totalAmount - amount);
                remainingOrder = fillOrders(self, cursor, filledNodeAmount);
            }

            self.nodes[cursor].left = 0;

            uint256 parent = self.nodes[cursor].parent;

            while (parent != EMPTY) {
                if (parent > cursor) {
                    // Relink the nodes
                    if (self.nodes[cursor].parent != parent) {
                        self.nodes[cursor].parent = parent;
                        self.nodes[parent].left = cursor;
                    }

                    cursor = parent;
                }

                parent = self.nodes[parent].parent;
            }
        }

        if (amount > totalAmount) {
            remainingAmount = amount - totalAmount;
        }

        if (lastNode == value && self.nodes[lastNode].orderTotalAmount == 0) {
            // The case that all node is dropped.
            self.root = EMPTY;
        } else if (value > self.root || (value == self.root && amount >= totalAmount)) {
            // The case that the root node is dropped
            self.root = cursor;
            self.nodes[cursor].parent = 0;
        }

        if (self.nodes[self.root].left == 0 && self.nodes[self.root].right != 0) {
            if (self.nodes[self.nodes[self.root].right].left != 0) {
                rotateRight(self, self.nodes[self.root].right);
            }
            rotateLeft(self, self.root);
        }

        if (self.nodes[self.root].red) {
            self.nodes[self.root].red = false;
        }
    }

    function dropRight(
        Tree storage self,
        uint256 amount,
        uint256 limitValue
    )
        internal
        returns (
            uint256 filledFutureValue,
            uint256 remainingAmount,
            RemainingOrder memory remainingOrder
        )
    {
        require(amount != EMPTY, "OrderStatisticsTree(408) - Amount to drop cannot be zero");
        uint256 value;
        uint256 cursor = last(self);
        uint256 firstNode = first(self);
        uint256 cursorNodeAmount = 0;
        uint256 totalAmount = 0;

        require(cursor >= limitValue || limitValue == 0, "Insufficient limit value");

        // Find a node whose total amount is over the amount of the argument.
        while (
            totalAmount < amount && cursor != EMPTY && (limitValue == 0 || cursor >= limitValue)
        ) {
            cursorNodeAmount = self.nodes[cursor].orderTotalAmount;
            totalAmount += cursorNodeAmount;
            value = cursor;

            uint256 filledAmount = cursorNodeAmount -
                (totalAmount > amount ? totalAmount - amount : 0);
            filledFutureValue += _calculateFutureValue(cursor, filledAmount);

            cursor = prev(self, cursor);
        }

        if (totalAmount >= amount || value == limitValue) {
            if (totalAmount > amount) {
                cursor = value;
                // Update order ids in the node.
                uint256 filledNodeAmount = cursorNodeAmount - (totalAmount - amount);
                remainingOrder = fillOrders(self, cursor, filledNodeAmount);
            }

            self.nodes[cursor].right = 0;

            uint256 parent = self.nodes[cursor].parent;

            while (parent != EMPTY) {
                if (parent < cursor) {
                    // Relink the nodes
                    if (self.nodes[cursor].parent != parent) {
                        self.nodes[cursor].parent = parent;
                        self.nodes[parent].right = cursor;
                    }

                    cursor = parent;
                }

                parent = self.nodes[parent].parent;
            }
        }

        if (amount > totalAmount) {
            remainingAmount = amount - totalAmount;
        }

        if (firstNode == value && self.nodes[firstNode].orderTotalAmount == 0) {
            // The case that all node is dropped.
            self.root = EMPTY;
        } else if (value < self.root || (value == self.root && amount >= totalAmount)) {
            // The case that the root node is dropped
            self.root = cursor;
            self.nodes[cursor].parent = 0;
        }

        if (self.nodes[self.root].right == 0 && self.nodes[self.root].left != 0) {
            if (self.nodes[self.nodes[self.root].left].right != 0) {
                rotateLeft(self, self.nodes[self.root].left);
            }
            rotateRight(self, self.root);
        }

        if (self.nodes[self.root].red) {
            self.nodes[self.root].red = false;
        }
    }

    function getFutureValue(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal view returns (uint256) {
        return _calculateFutureValue(value, self.nodes[value].orders[orderId].amount);
    }

    // Double linked list functions
    /**
     * @dev Retrieves the Object denoted by `_id`.
     */
    function getOrderById(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal view returns (OrderItem memory) {
        Node storage gn = self.nodes[value];
        return gn.orders[orderId];
    }

    /**
     * @dev Return boolean if value, amount and orderId exist in doubly linked list
     */
    function orderIdExists(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal view returns (bool) {
        uint48 cursor = orderId;
        Node storage gn = self.nodes[value];
        OrderItem memory order = gn.orders[cursor];

        if (order.orderId != cursor) {
            return false;
        }

        while (order.prev != EMPTY) {
            cursor = order.prev;
            order = gn.orders[cursor];
        }

        return cursor == gn.head;
    }

    function insertOrder(
        Tree storage self,
        uint256 value,
        uint48 orderId,
        address user,
        uint256 amount,
        bool isInterruption
    ) internal {
        require(amount > 0, "Insufficient amount");
        insert(self, value);

        if (isInterruption) {
            addHead(self, value, orderId, user, amount);
        } else {
            addTail(self, value, orderId, user, amount);
        }
    }

    function removeOrder(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal returns (uint256 amount) {
        require(
            isActiveOrderId(self, value, orderId),
            "OrderStatisticsTree(410) - Order does not exist."
        );
        amount = _removeOrder(self, value, orderId);
        remove(self, value);
    }

    /**
     * @dev Reduces order amount once market order taken.
     */
    function fillOrders(
        Tree storage self,
        uint256 value,
        uint256 _amount
    ) internal returns (RemainingOrder memory remainingOrder) {
        Node storage gn = self.nodes[value];

        require(
            gn.orderTotalAmount >= _amount,
            "OrderStatisticsTree(410) - Amount to fill is insufficient"
        );

        uint256 remainingAmount = _amount;
        uint256 filledCount = 0;
        OrderItem memory currentOrder = gn.orders[gn.head];
        uint48 orderId = gn.head;

        while (orderId != 0 && remainingAmount != 0) {
            currentOrder = gn.orders[orderId];

            if (currentOrder.amount <= remainingAmount) {
                remainingAmount -= currentOrder.amount;
                orderId = currentOrder.next;
            } else {
                remainingOrder = RemainingOrder(
                    currentOrder.orderId,
                    currentOrder.maker,
                    currentOrder.amount - remainingAmount,
                    value
                );
                remainingAmount = 0;
            }

            filledCount++;
        }

        _dropOrders(self, value, currentOrder.orderId);

        if (remainingOrder.amount > 0) {
            // NOTE: This order that the filled partially was dropped from a node, and the unfilled amount
            // will be inserted newly as a new orders.
            // However, that filled order amount is used when future value is calculated from inactive order.
            // For that calculation, this order amount needs to be updated by an actual filled amount at this point.
            OrderItem storage order = self.nodes[value].orders[currentOrder.orderId];
            order.amount -= remainingOrder.amount;
        }
    }

    /**
     * @dev Insert a new OrderItem as the new Head with `_amount` in the amount field, and orderId.
     */
    function addHead(
        Tree storage self,
        uint256 _value,
        uint48 _orderId,
        address _user,
        uint256 _amount
    ) internal {
        Node storage gn = self.nodes[_value];
        uint48 orderId = _createOrder(self, _value, _orderId, _user, _amount);
        _link(self, _value, orderId, gn.head);
        _setHead(self, _value, orderId);
        if (gn.tail == 0) _setTail(self, _value, orderId);
    }

    /**
     * @dev Insert a new OrderItem as the new Tail with `_amount` in the amount field, and orderId.
     */
    function addTail(
        Tree storage self,
        uint256 _value,
        uint48 _orderId,
        address _user,
        uint256 _amount
    ) internal {
        Node storage gn = self.nodes[_value];

        if (gn.head == 0) {
            addHead(self, _value, _orderId, _user, _amount);
        } else {
            uint48 orderId = _createOrder(self, _value, _orderId, _user, _amount);
            _link(self, _value, gn.tail, orderId);
            _setTail(self, _value, orderId);
        }
    }

    /**
     * @dev Internal function to create an unlinked Order.
     */
    function _createOrder(
        Tree storage self,
        uint256 value,
        uint48 orderId,
        address user,
        uint256 amount
    ) internal returns (uint48) {
        Node storage gn = self.nodes[value];
        require(
            gn.orders[orderId].timestamp == 0,
            "OrderStatisticsTree(409) - Order id already exist."
        );

        gn.orderCounter += 1;
        gn.orderTotalAmount += amount;
        OrderItem memory order = OrderItem(orderId, 0, 0, user, block.timestamp, amount);
        gn.orders[orderId] = order;
        return order.orderId;
    }

    /**
     * @dev Remove the OrderItem denoted by `_id` from the list.
     */
    function _removeOrder(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal returns (uint256 amount) {
        require(
            isActiveOrderId(self, value, orderId),
            "OrderStatisticsTree(410) - Order does not exist."
        );
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[orderId];
        amount = order.amount;

        if (gn.head == orderId && gn.tail == orderId) {
            _setHead(self, value, 0);
            _setTail(self, value, 0);
        } else if (gn.head == orderId) {
            _setHead(self, value, order.next);
            gn.orders[order.next].prev = 0;
        } else if (gn.tail == orderId) {
            _setTail(self, value, order.prev);
            gn.orders[order.prev].next = 0;
        } else {
            _link(self, value, order.prev, order.next);
        }
        delete gn.orders[order.orderId];
        gn.orderCounter -= 1;
        gn.orderTotalAmount -= order.amount;
    }

    /**
     * @dev Drop the OrderItems older than or equal `orderId` from the list
     */
    function _dropOrders(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal returns (uint256 amount) {
        require(
            isActiveOrderId(self, value, orderId),
            "OrderStatisticsTree(410) - Order does not exist."
        );
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[orderId];
        amount = order.amount;
        uint256 cursor = gn.head;
        uint256 removedCount = 1;
        uint256 removedAmount = gn.orders[cursor].amount;

        while (cursor != orderId) {
            cursor = gn.orders[cursor].next;
            removedCount++;
            removedAmount += gn.orders[cursor].amount;
        }

        if (gn.tail == orderId) {
            _setHead(self, value, 0);
            _setTail(self, value, 0);
        } else {
            _setHead(self, value, order.next);
            gn.orders[order.next].prev = 0;
        }

        gn.orderCounter -= removedCount;
        gn.orderTotalAmount -= removedAmount;
    }

    /**
     * @dev Internal function to update the Head pointer.
     */
    function _setHead(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal {
        Node storage gn = self.nodes[value];

        gn.head = orderId;
    }

    /**
     * @dev Internal function to update the Tail pointer.
     */
    function _setTail(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal {
        Node storage gn = self.nodes[value];

        gn.tail = orderId;
    }

    /**
     * @dev Internal function to link an Object to another.
     */
    function _link(
        Tree storage self,
        uint256 value,
        uint48 _prevId,
        uint48 _nextId
    ) internal {
        Node storage gn = self.nodes[value];

        gn.orders[_prevId].next = _nextId;
        gn.orders[_nextId].prev = _prevId;
    }

    function _calculateFutureValue(uint256 unitPrice, uint256 amount)
        internal
        pure
        returns (uint256)
    {
        return (amount * ProtocolTypes.PRICE_DIGIT) / unitPrice;
    }
}
