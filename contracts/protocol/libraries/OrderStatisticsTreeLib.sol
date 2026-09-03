// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// libraries
import {Constants} from "../libraries/Constants.sol";
// types
import {RoundingUint256} from "./math/RoundingUint256.sol";

struct RemainingOrder {
    uint48 orderId;
    address maker;
    uint256 amount;
    uint256 unitPrice;
}

struct PartiallyRemovedOrder {
    uint48 orderId;
    address maker;
    uint256 amount;
    uint256 futureValue;
}

/**
 * @notice OrderStatisticsTreeLib is a Red-Black Tree binary search library
 * based on the following library that is extended to manage order data.
 *
 * https://github.com/rob-Hitchens/OrderStatisticsTree
 *
 */
library OrderStatisticsTreeLib {
    using RoundingUint256 for uint256;
    uint256 private constant EMPTY = 0;
    uint16 private constant ORDER_CHUNK_SIZE = 100;
    uint32 private constant MAX_ACTIVE_CHUNKS_PER_PRICE = 1000;

    struct Node {
        uint256 parent;
        uint256 left;
        uint256 right;
        bool red;
        uint48 head;
        uint48 tail;
        uint256 orderCounter;
        uint256 orderTotalAmount;
        mapping(uint48 orderId => OrderItem) orders;
    }

    struct OrderChunk {
        uint256 totalAmount;
        uint48 firstOrderId;
        uint32 prevChunkId;
        uint32 nextChunkId;
        uint16 orderCount;
    }

    struct PriceChunkMetadata {
        uint32 firstChunkId;
        uint32 lastChunkId;
        uint32 lastAllocatedChunkId;
        uint48 explicitMappingStartOrderId;
        uint32 activeChunkCount;
        mapping(uint32 chunkId => OrderChunk chunk) chunks;
        mapping(uint48 orderId => uint32 chunkId) orderChunkIds;
    }

    struct Tree {
        uint256 root;
        mapping(uint256 value => Node) nodes;
        mapping(uint256 value => PriceChunkMetadata metadata) chunkMetadata;
    }

    struct OrderItem {
        uint48 orderId;
        uint48 next;
        uint48 prev;
        address maker;
        uint256 amount;
    }

    function first(Tree storage self) internal view returns (uint256 value) {
        value = self.root;
        if (value == EMPTY) return 0;
        while (self.nodes[value].left != EMPTY) {
            value = self.nodes[value].left;
        }
    }

    function last(Tree storage self) internal view returns (uint256 value) {
        value = self.root;
        if (value == EMPTY) return 0;
        while (self.nodes[value].right != EMPTY) {
            value = self.nodes[value].right;
        }
    }

    function hasOrders(Tree storage self) internal view returns (bool) {
        return self.root != EMPTY;
    }

    function next(Tree storage self, uint256 value) internal view returns (uint256 cursor) {
        require(value != EMPTY, "OSTLib: Value cannot be zero");
        if (self.nodes[value].right != EMPTY) {
            cursor = treeMinimum(self, self.nodes[value].right);
        } else {
            cursor = self.nodes[value].parent;
            while (cursor != EMPTY && value == self.nodes[cursor].right) {
                value = cursor;
                cursor = self.nodes[cursor].parent;
            }
        }
    }

    function prev(Tree storage self, uint256 value) internal view returns (uint256 cursor) {
        require(value != EMPTY, "OSTLib: Value cannot be zero");
        if (self.nodes[value].left != EMPTY) {
            cursor = treeMaximum(self, self.nodes[value].left);
        } else {
            cursor = self.nodes[value].parent;
            while (cursor != EMPTY && value == self.nodes[cursor].left) {
                value = cursor;
                cursor = self.nodes[cursor].parent;
            }
        }
    }

    function search(
        Tree storage self,
        uint256 value
    ) internal view returns (bool valueExists, uint256 parent) {
        uint256 cursor = self.root;

        while (cursor != EMPTY) {
            if (value < cursor) {
                parent = cursor;
                cursor = self.nodes[cursor].left;
            } else if (value > cursor) {
                parent = cursor;
                cursor = self.nodes[cursor].right;
            }

            if (value == cursor) {
                break;
            }
        }

        valueExists = cursor != EMPTY;
    }

    function exists(Tree storage self, uint256 value) internal view returns (bool) {
        if (value == self.root) return true;

        uint256 cursor = value;
        while (self.nodes[cursor].parent != EMPTY) {
            uint256 parent = self.nodes[cursor].parent;
            Node storage gn = self.nodes[parent];
            if (gn.left != cursor && gn.right != cursor) {
                return false;
            }
            if (parent == self.root) {
                return true;
            }
            cursor = parent;
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

    function getNode(
        Tree storage self,
        uint256 value
    ) internal view returns (uint256, uint256, uint256, bool, uint256, uint256, uint256, uint256) {
        require(exists(self, value), "OSTLib: Value does not exist");
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

    function getNodeTotalAmount(
        Tree storage self,
        uint256 value
    ) internal view returns (uint256 totalAmount) {
        return self.nodes[value].orderTotalAmount;
    }

    function getNodeOrderIds(
        Tree storage self,
        uint256 value
    ) internal view returns (uint48[] memory orderIds) {
        Node storage gn = self.nodes[value];
        OrderItem memory order = gn.orders[gn.head];
        orderIds = new uint48[](gn.orderCounter);

        for (uint256 i; i < gn.orderCounter; i++) {
            orderIds[i] = order.orderId;
            order = gn.orders[order.next];
        }
    }

    function count(Tree storage self) internal view returns (uint256) {
        return getNodeCount(self, self.root);
    }

    function insert(Tree storage self, uint256 value) internal {
        require(value != EMPTY, "OSTLib: Value cannot be zero");
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
        if (self.root == EMPTY || nValue.orderCounter != 0) {
            nValue.orderCounter = 0;
            nValue.orderTotalAmount = 0;
            _setHead(self, value, 0);
            _setTail(self, value, 0);

            // Reset scalar metadata for a reused price level. Nested mappings remain in storage.
            delete self.chunkMetadata[value];
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
        require(value != EMPTY, "OSTLib: Value cannot be zero");
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
            bool probeIsLeftChild = cursorParent != EMPTY &&
                cursor == self.nodes[cursorParent].left;

            if (probe != EMPTY) {
                self.nodes[probe].parent = cursorParent;
            }

            if (cursorParent != EMPTY) {
                if (probeIsLeftChild) {
                    self.nodes[cursorParent].left = probe;
                } else {
                    self.nodes[cursorParent].right = probe;
                }
            } else {
                self.root = probe;
            }

            bool doFixup = !self.nodes[cursor].red;
            uint256 probeParent = cursorParent;

            if (cursor != value) {
                replaceParent(self, cursor, value);

                uint256 valueLeft = self.nodes[value].left;
                self.nodes[cursor].left = valueLeft;
                if (valueLeft != EMPTY) {
                    self.nodes[valueLeft].parent = cursor;
                }

                uint256 valueRight = self.nodes[value].right;
                self.nodes[cursor].right = valueRight;
                if (valueRight != EMPTY) {
                    self.nodes[valueRight].parent = cursor;
                }

                self.nodes[cursor].red = self.nodes[value].red;

                if (probeParent == value) {
                    probeParent = cursor;
                }

                (cursor, value) = (value, cursor);
            }

            if (doFixup) {
                removeFixup(self, probe, probeParent, probeIsLeftChild);
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

        while (value != self.root && _isRed(self, self.nodes[value].parent)) {
            uint256 valueParent = self.nodes[value].parent;
            uint256 valueGrandParent = self.nodes[valueParent].parent;

            if (valueParent == self.nodes[valueGrandParent].left) {
                cursor = self.nodes[valueGrandParent].right;
                if (_isRed(self, cursor)) {
                    self.nodes[valueParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[valueGrandParent].red = true;
                    value = valueGrandParent;
                } else {
                    if (value == self.nodes[valueParent].right) {
                        value = valueParent;
                        rotateLeft(self, value);
                    }
                    valueParent = self.nodes[value].parent;
                    valueGrandParent = self.nodes[valueParent].parent;
                    self.nodes[valueParent].red = false;
                    self.nodes[valueGrandParent].red = true;
                    rotateRight(self, valueGrandParent);
                }
            } else {
                cursor = self.nodes[valueGrandParent].left;
                if (_isRed(self, cursor)) {
                    self.nodes[valueParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[valueGrandParent].red = true;
                    value = valueGrandParent;
                } else {
                    if (value == self.nodes[valueParent].left) {
                        value = valueParent;
                        rotateRight(self, value);
                    }
                    valueParent = self.nodes[value].parent;
                    valueGrandParent = self.nodes[valueParent].parent;
                    self.nodes[valueParent].red = false;
                    self.nodes[valueGrandParent].red = true;
                    rotateLeft(self, valueGrandParent);
                }
            }
        }

        self.nodes[self.root].red = false;
    }

    function replaceParent(Tree storage self, uint256 a, uint256 b) private {
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

    function removeFixup(
        Tree storage self,
        uint256 value,
        uint256 parent,
        bool valueIsLeftChild
    ) private {
        uint256 cursor;
        while (value != self.root && !_isRed(self, value)) {
            uint256 valueParent = value == EMPTY ? parent : self.nodes[value].parent;
            if (valueParent == EMPTY) {
                break;
            }

            bool isLeftChild = value == EMPTY
                ? valueIsLeftChild
                : value == self.nodes[valueParent].left;

            if (isLeftChild) {
                cursor = self.nodes[valueParent].right;
                if (_isRed(self, cursor)) {
                    self.nodes[cursor].red = false;
                    self.nodes[valueParent].red = true;
                    rotateLeft(self, valueParent);
                    cursor = self.nodes[valueParent].right;
                }

                if (!_isRed(self, _leftOf(self, cursor)) && !_isRed(self, _rightOf(self, cursor))) {
                    _setRedIfNotEmpty(self, cursor);
                    value = valueParent;
                    parent = self.nodes[value].parent;
                    valueIsLeftChild = parent != EMPTY && value == self.nodes[parent].left;
                } else {
                    if (!_isRed(self, _rightOf(self, cursor))) {
                        _setBlackIfNotEmpty(self, _leftOf(self, cursor));
                        _setRedIfNotEmpty(self, cursor);
                        rotateRight(self, cursor);
                        cursor = self.nodes[valueParent].right;
                    }
                    self.nodes[cursor].red = self.nodes[valueParent].red;
                    self.nodes[valueParent].red = false;
                    _setBlackIfNotEmpty(self, _rightOf(self, cursor));
                    rotateLeft(self, valueParent);
                    value = self.root;
                    parent = EMPTY;
                }
            } else {
                cursor = self.nodes[valueParent].left;
                if (_isRed(self, cursor)) {
                    self.nodes[cursor].red = false;
                    self.nodes[valueParent].red = true;
                    rotateRight(self, valueParent);
                    cursor = self.nodes[valueParent].left;
                }

                if (!_isRed(self, _rightOf(self, cursor)) && !_isRed(self, _leftOf(self, cursor))) {
                    _setRedIfNotEmpty(self, cursor);
                    value = valueParent;
                    parent = self.nodes[value].parent;
                    valueIsLeftChild = parent != EMPTY && value == self.nodes[parent].left;
                } else {
                    if (!_isRed(self, _leftOf(self, cursor))) {
                        _setBlackIfNotEmpty(self, _rightOf(self, cursor));
                        _setRedIfNotEmpty(self, cursor);
                        rotateLeft(self, cursor);
                        cursor = self.nodes[valueParent].left;
                    }
                    self.nodes[cursor].red = self.nodes[valueParent].red;
                    self.nodes[valueParent].red = false;
                    _setBlackIfNotEmpty(self, _leftOf(self, cursor));
                    rotateRight(self, valueParent);
                    value = self.root;
                    parent = EMPTY;
                }
            }
        }

        _setBlackIfNotEmpty(self, value);
    }

    function _leftOf(Tree storage self, uint256 value) private view returns (uint256) {
        return value == EMPTY ? EMPTY : self.nodes[value].left;
    }

    function _rightOf(Tree storage self, uint256 value) private view returns (uint256) {
        return value == EMPTY ? EMPTY : self.nodes[value].right;
    }

    function _isRed(Tree storage self, uint256 value) private view returns (bool) {
        return value != EMPTY && self.nodes[value].red;
    }

    function _setRedIfNotEmpty(Tree storage self, uint256 value) private {
        if (value != EMPTY) {
            self.nodes[value].red = true;
        }
    }

    function _setBlackIfNotEmpty(Tree storage self, uint256 value) private {
        if (value != EMPTY) {
            self.nodes[value].red = false;
        }
    }

    function calculateDroppedAmountFromLeft(
        Tree storage self,
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue
    )
        internal
        view
        returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV)
    {
        (droppedValue, , , droppedAmount, droppedAmountInFV, , ) = _calculateDroppedAmountFromLeft(
            self,
            amount,
            amountInFV,
            limitValue,
            first(self)
        );
    }

    function calculateDroppedAmountFromRight(
        Tree storage self,
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue
    )
        internal
        view
        returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV)
    {
        (droppedValue, , , droppedAmount, droppedAmountInFV, , ) = _calculateDroppedAmountFromRight(
            self,
            amount,
            amountInFV,
            limitValue,
            last(self)
        );
    }

    struct DropVars {
        uint256 cursor;
        uint256 cursorNodeAmount;
        uint256 exceededAmount;
        uint256 exceededAmountInFV;
        uint256 totalNodeAmount;
        uint256 fixupParent;
        uint256 removedChild;
        uint256 relinkFixupStart;
        uint256 relinkFixupStopParent;
    }

    function dropLeft(
        Tree storage self,
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue
    )
        internal
        returns (
            uint256 droppedValue,
            uint256 droppedAmount,
            uint256 droppedAmountInFV,
            uint256 remainingAmount,
            PartiallyRemovedOrder memory partiallyRemovedOrder
        )
    {
        DropVars memory vars;
        vars.cursor = first(self);

        require(vars.cursor <= limitValue || limitValue == 0, "OSTLib: Insufficient limit value");

        (
            droppedValue,
            vars.cursor,
            vars.cursorNodeAmount,
            droppedAmount,
            droppedAmountInFV,
            vars.exceededAmount,
            vars.exceededAmountInFV
        ) = _calculateDroppedAmountFromLeft(self, amount, amountInFV, limitValue, vars.cursor);

        vars.totalNodeAmount = droppedAmount + vars.exceededAmount;
        vars.fixupParent = EMPTY;

        if (vars.totalNodeAmount > 0) {
            if (vars.exceededAmount > 0) {
                vars.cursor = droppedValue;
                // Update order ids in the node.
                partiallyRemovedOrder = removeOrders(
                    self,
                    vars.cursor,
                    vars.cursorNodeAmount - vars.exceededAmount
                );
            } else if (vars.exceededAmountInFV > 0) {
                vars.cursor = droppedValue;
                // Update order ids in the node.
                partiallyRemovedOrder = removeOrders(
                    self,
                    vars.cursor,
                    vars.cursorNodeAmount -
                        _calculatePresentValue(vars.cursor, vars.exceededAmountInFV)
                );
            }

            vars.removedChild = self.nodes[vars.cursor].left;
            self.nodes[vars.cursor].left = EMPTY;
            if (_blackHeight(self, vars.removedChild) > _blackHeight(self, EMPTY)) {
                vars.fixupParent = vars.cursor;
            }

            uint256 parent = self.nodes[vars.cursor].parent;

            if (vars.cursor != EMPTY) {
                while (parent != EMPTY) {
                    if (parent > vars.cursor) {
                        // Relink the nodes
                        if (self.nodes[vars.cursor].parent != parent) {
                            uint256 oldLeft = self.nodes[parent].left;
                            uint256 newLeft = vars.cursor;

                            self.nodes[vars.cursor].parent = parent;
                            self.nodes[parent].left = newLeft;

                            if (_blackHeight(self, oldLeft) > _blackHeight(self, newLeft)) {
                                if (vars.relinkFixupStart == EMPTY) {
                                    vars.relinkFixupStart = parent;
                                }
                                vars.relinkFixupStopParent = self.nodes[parent].parent;
                            }
                        }

                        vars.cursor = parent;
                    }

                    parent = self.nodes[parent].parent;
                }
            }
        }

        if (amount > vars.totalNodeAmount) {
            remainingAmount = amount - vars.totalNodeAmount;
        }

        uint256 lastNode = last(self);

        if (lastNode == droppedValue && self.nodes[lastNode].orderTotalAmount == 0) {
            // The case that all node is dropped.
            self.root = EMPTY;
        } else if (
            droppedValue > self.root ||
            (droppedValue == self.root && droppedAmount == vars.totalNodeAmount)
        ) {
            // The case that the root node is dropped
            self.root = vars.cursor;
            self.nodes[vars.cursor].parent = 0;
        }

        if (self.root != EMPTY) {
            _rebalanceBlackHeights(
                self,
                vars.fixupParent != EMPTY ? vars.fixupParent : vars.relinkFixupStart,
                vars.relinkFixupStopParent
            );
        }
    }

    function dropRight(
        Tree storage self,
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue
    )
        internal
        returns (
            uint256 droppedValue,
            uint256 droppedAmount,
            uint256 droppedAmountInFV,
            uint256 remainingAmount,
            PartiallyRemovedOrder memory partiallyRemovedOrder
        )
    {
        DropVars memory vars;
        vars.cursor = last(self);

        require(vars.cursor >= limitValue || limitValue == 0, "OSTLib: Insufficient limit value");

        (
            droppedValue,
            vars.cursor,
            vars.cursorNodeAmount,
            droppedAmount,
            droppedAmountInFV,
            vars.exceededAmount,
            vars.exceededAmountInFV
        ) = _calculateDroppedAmountFromRight(self, amount, amountInFV, limitValue, vars.cursor);

        vars.totalNodeAmount = droppedAmount + vars.exceededAmount;
        vars.fixupParent = EMPTY;

        if (vars.totalNodeAmount > 0) {
            if (vars.exceededAmount > 0) {
                vars.cursor = droppedValue;
                // Update order ids in the node.
                partiallyRemovedOrder = removeOrders(
                    self,
                    vars.cursor,
                    vars.cursorNodeAmount - vars.exceededAmount
                );
            } else if (vars.exceededAmountInFV > 0) {
                vars.cursor = droppedValue;
                // Update order ids in the node.
                partiallyRemovedOrder = removeOrders(
                    self,
                    vars.cursor,
                    vars.cursorNodeAmount -
                        _calculatePresentValue(vars.cursor, vars.exceededAmountInFV)
                );
            }

            vars.removedChild = self.nodes[vars.cursor].right;
            self.nodes[vars.cursor].right = EMPTY;
            if (_blackHeight(self, vars.removedChild) > _blackHeight(self, EMPTY)) {
                vars.fixupParent = vars.cursor;
            }

            uint256 parent = self.nodes[vars.cursor].parent;

            if (vars.cursor != EMPTY) {
                while (parent != EMPTY) {
                    if (parent < vars.cursor) {
                        // Relink the nodes
                        if (self.nodes[vars.cursor].parent != parent) {
                            uint256 oldRight = self.nodes[parent].right;
                            uint256 newRight = vars.cursor;

                            self.nodes[vars.cursor].parent = parent;
                            self.nodes[parent].right = newRight;

                            if (_blackHeight(self, oldRight) > _blackHeight(self, newRight)) {
                                if (vars.relinkFixupStart == EMPTY) {
                                    vars.relinkFixupStart = parent;
                                }
                                vars.relinkFixupStopParent = self.nodes[parent].parent;
                            }
                        }

                        vars.cursor = parent;
                    }

                    parent = self.nodes[parent].parent;
                }
            }
        }

        if (amount > vars.totalNodeAmount) {
            remainingAmount = amount - vars.totalNodeAmount;
        }

        uint256 firstNode = first(self);

        if (firstNode == droppedValue && self.nodes[firstNode].orderTotalAmount == 0) {
            // The case that all node is dropped.
            self.root = EMPTY;
        } else if (
            droppedValue < self.root ||
            (droppedValue == self.root && droppedAmount == vars.totalNodeAmount)
        ) {
            // The case that the root node is dropped
            self.root = vars.cursor;
            self.nodes[vars.cursor].parent = 0;
        }

        if (self.root != EMPTY) {
            _rebalanceBlackHeights(
                self,
                vars.fixupParent != EMPTY ? vars.fixupParent : vars.relinkFixupStart,
                vars.relinkFixupStopParent
            );
        }
    }

    function _hasBlackDeficitFromLeft(
        Tree storage self,
        uint256 target
    ) private view returns (bool) {
        return
            target != EMPTY &&
            _blackHeight(self, _leftOf(self, target)) < _blackHeight(self, _rightOf(self, target));
    }

    function _hasBlackDeficitFromRight(
        Tree storage self,
        uint256 target
    ) private view returns (bool) {
        return
            target != EMPTY &&
            _blackHeight(self, _rightOf(self, target)) < _blackHeight(self, _leftOf(self, target));
    }

    function _rebalanceBlackHeights(
        Tree storage self,
        uint256 target,
        uint256 stopParent
    ) private returns (uint256 processedUntil) {
        bool reachedStopParent;

        while (target != EMPTY) {
            processedUntil = target;

            if (stopParent != EMPTY && target == stopParent) {
                reachedStopParent = true;
            }

            (uint256 leftBlackHeight, uint256 rightBlackHeight) = _childBlackHeights(self, target);
            bool fixedAtTarget;
            bool targetChangedByFix;

            while (leftBlackHeight != rightBlackHeight) {
                // The two child subtrees have different black heights. Fix the side that has
                // the black deficit. dropLeft/dropRight can remove a whole subtree, so the
                // deficit may be larger than one black level; after one fix, the same node
                // can still be locally imbalanced and must be rechecked before moving upward.
                fixedAtTarget = true;
                (target, leftBlackHeight, rightBlackHeight, targetChangedByFix) = _fixBlackDeficit(
                    self,
                    target,
                    leftBlackHeight,
                    rightBlackHeight
                );

                if (targetChangedByFix) {
                    break;
                }
            }

            if (targetChangedByFix) {
                continue;
            }

            if (leftBlackHeight == rightBlackHeight) {
                if (fixedAtTarget) {
                    // This target was just rebalanced. Even if its local black heights now match,
                    // the fix may have changed this subtree's effective black height, so continue
                    // upward and let the parent verify whether the change propagated.
                    target = self.nodes[target].parent;
                } else if (reachedStopParent) {
                    // We reached the first node above the relink-affected path, and no fix was
                    // needed at this node. Its subtree black height is unchanged, so no further
                    // ancestor can be affected.
                    target = EMPTY;
                } else {
                    // This node is locally balanced, but it is still within the relink-affected
                    // path. Continue upward until the stop parent is reached.
                    target = self.nodes[target].parent;
                }
            }
        }

        _setBlackIfNotEmpty(self, self.root);
    }

    function _fixBlackDeficit(
        Tree storage self,
        uint256 target,
        uint256 leftBlackHeight,
        uint256 rightBlackHeight
    )
        private
        returns (
            uint256 nextTarget,
            uint256 newLeftBlackHeight,
            uint256 newRightBlackHeight,
            bool targetChangedByFix
        )
    {
        uint256 deficitBefore = _absDiff(leftBlackHeight, rightBlackHeight);

        if (leftBlackHeight < rightBlackHeight) {
            // The left subtree is missing black height after a drop/relink from the left.
            nextTarget = _fixBlackDeficitFromLeft(self, target);
        } else {
            // The right subtree is missing black height after a drop/relink from the right.
            nextTarget = _fixBlackDeficitFromRight(self, target);
        }

        (newLeftBlackHeight, newRightBlackHeight) = _childBlackHeights(self, target);

        if (newLeftBlackHeight != newRightBlackHeight) {
            require(
                _absDiff(newLeftBlackHeight, newRightBlackHeight) < deficitBefore,
                "OSTLib: Rebalance did not converge"
            );

            // The original node still has a local black-height mismatch. Reprocess it
            // using the newly calculated black heights instead of recalculating them at
            // the top of the outer loop.
            return (target, newLeftBlackHeight, newRightBlackHeight, false);
        }

        if (nextTarget != target) {
            // The original node is locally balanced and the fix propagated the remaining
            // effect to another node, usually the parent. Restart the outer loop because
            // the cached black heights belong to the original target, not to nextTarget.
            return (nextTarget, 0, 0, true);
        }

        return (target, newLeftBlackHeight, newRightBlackHeight, false);
    }

    function _childBlackHeights(
        Tree storage self,
        uint256 target
    ) private view returns (uint256 leftBlackHeight, uint256 rightBlackHeight) {
        leftBlackHeight = _blackHeight(self, _leftOf(self, target));
        rightBlackHeight = _blackHeight(self, _rightOf(self, target));
    }

    function _absDiff(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    function _blackHeight(Tree storage self, uint256 value) private view returns (uint256 height) {
        while (value != EMPTY) {
            if (!_isRed(self, value)) {
                height++;
            }

            uint256 left = self.nodes[value].left;
            if (left != EMPTY) {
                value = left;
            } else {
                value = self.nodes[value].right;
            }
        }

        // EMPTY leaf is treated as black.
        return height + 1;
    }

    function _fixBlackDeficitFromLeft(
        Tree storage self,
        uint256 target
    ) private returns (uint256 nextTarget) {
        if (target == EMPTY) {
            return EMPTY;
        }

        uint256 sibling = _rightOf(self, target);

        if (_isRed(self, sibling)) {
            self.nodes[sibling].red = false;
            self.nodes[target].red = true;
            rotateLeft(self, target);
            sibling = _rightOf(self, target);
        }

        uint256 siblingLeft = _leftOf(self, sibling);
        uint256 siblingRight = _rightOf(self, sibling);

        if (!_isRed(self, siblingLeft) && !_isRed(self, siblingRight)) {
            _setRedIfNotEmpty(self, sibling);

            if (_isRed(self, target)) {
                self.nodes[target].red = false;
                return target;
            }

            uint256 parent = self.nodes[target].parent;
            return parent == EMPTY ? target : parent;
        }

        if (!_isRed(self, siblingRight)) {
            _setBlackIfNotEmpty(self, siblingLeft);
            _setRedIfNotEmpty(self, sibling);
            rotateRight(self, sibling);
            sibling = _rightOf(self, target);
        }

        self.nodes[sibling].red = _isRed(self, target);
        self.nodes[target].red = false;
        _setBlackIfNotEmpty(self, _rightOf(self, sibling));

        rotateLeft(self, target);
        return target;
    }

    function _fixBlackDeficitFromRight(
        Tree storage self,
        uint256 target
    ) private returns (uint256 nextTarget) {
        if (target == EMPTY) {
            return EMPTY;
        }

        uint256 sibling = _leftOf(self, target);

        if (_isRed(self, sibling)) {
            self.nodes[sibling].red = false;
            self.nodes[target].red = true;
            rotateRight(self, target);
            sibling = _leftOf(self, target);
        }

        uint256 siblingLeft = _leftOf(self, sibling);
        uint256 siblingRight = _rightOf(self, sibling);

        if (!_isRed(self, siblingLeft) && !_isRed(self, siblingRight)) {
            _setRedIfNotEmpty(self, sibling);

            if (_isRed(self, target)) {
                self.nodes[target].red = false;
                return target;
            }

            uint256 parent = self.nodes[target].parent;
            return parent == EMPTY ? target : parent;
        }

        if (!_isRed(self, siblingLeft)) {
            _setBlackIfNotEmpty(self, siblingRight);
            _setRedIfNotEmpty(self, sibling);
            rotateLeft(self, sibling);
            sibling = _leftOf(self, target);
        }

        self.nodes[sibling].red = _isRed(self, target);
        self.nodes[target].red = false;
        _setBlackIfNotEmpty(self, _leftOf(self, sibling));

        rotateRight(self, target);
        return target;
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
    ) internal view returns (address maker, uint256 amount) {
        Node storage gn = self.nodes[value];
        OrderItem memory order = gn.orders[orderId];

        maker = order.maker;
        amount = order.amount;
    }

    /**
     * @dev Return boolean if value, amount and orderId exist in doubly linked list
     * Order IDs must increase monotonically because prefix removals leave old orders in storage
     * and use the current head order ID to distinguish them from active orders.
     */
    function orderIdExists(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal view returns (bool) {
        Node storage gn = self.nodes[value];

        return gn.head != 0 && orderId >= gn.head && gn.orders[orderId].orderId == orderId;
    }

    function insertOrder(
        Tree storage self,
        uint256 value,
        uint48 orderId,
        address user,
        uint256 amount
    ) internal {
        require(amount > 0, "OSTLib: Insufficient amount");
        require(value <= Constants.PRICE_DIGIT, "OSTLib: Value too high");

        insert(self, value);

        // TODO: Remove this check after the migration is complete.
        // This is to ensure that the chunk metadata is created for existing orders.
        _ensureChunkMetadata(self, value);

        addTail(self, value, orderId, user, amount);
        _addOrderToChunk(self.chunkMetadata[value], orderId, amount);
    }

    function removeOrder(
        Tree storage self,
        uint256 value,
        uint48 orderId
    ) internal returns (uint256 amount) {
        // TODO: Remove this check after the migration is complete.
        // This is to ensure that the chunk metadata is created for existing orders.
        _ensureChunkMetadata(self, value);

        Node storage gn = self.nodes[value];
        OrderItem storage order = gn.orders[orderId];
        _removeOrderFromChunk(self.chunkMetadata[value], orderId, order.amount, order.next);

        amount = _removeOrder(self, value, orderId);
        remove(self, value);
    }

    function removeOrders(
        Tree storage self,
        uint256 value,
        uint256 amount
    ) internal returns (PartiallyRemovedOrder memory partiallyRemovedOrder) {
        Node storage gn = self.nodes[value];
        require(gn.orderTotalAmount >= amount, "OSTLib: Amount to remove is insufficient");

        // TODO: Remove this check after the migration is complete.
        // This is to ensure that the chunk metadata is created for existing orders.
        _ensureChunkMetadata(self, value);

        PriceChunkMetadata storage metadata = self.chunkMetadata[value];
        uint256 remainingAmount = amount;
        uint256 fullyRemovedCount;
        uint256 fullyRemovedAmount;
        uint48 partiallyRemovedOrderId;
        uint256 partiallyRemovedAmount;
        uint32 removedChunkCount;
        uint32 chunkId = metadata.firstChunkId;

        while (chunkId != 0 && remainingAmount > 0) {
            OrderChunk storage chunk = metadata.chunks[chunkId];
            uint32 nextChunkId = chunk.nextChunkId;

            if (chunk.totalAmount > remainingAmount) {
                break;
            }

            remainingAmount -= chunk.totalAmount;
            fullyRemovedAmount += chunk.totalAmount;
            fullyRemovedCount += chunk.orderCount;
            removedChunkCount += 1;
            chunkId = nextChunkId;
        }

        if (chunkId != 0 && remainingAmount > 0) {
            uint256 removedAmount;
            uint256 removedCount;

            (
                removedAmount,
                removedCount,
                partiallyRemovedOrderId,
                partiallyRemovedAmount,
                remainingAmount
            ) = _removeOrdersFromBoundaryChunk(gn, metadata.chunks[chunkId], remainingAmount);
            fullyRemovedAmount += removedAmount;
            fullyRemovedCount += removedCount;
        }

        require(remainingAmount == 0, "OSTLib: Insufficient chunk amount");

        if (removedChunkCount > 0) {
            _unlinkChunkPrefix(metadata, chunkId, removedChunkCount);
        }

        if (fullyRemovedCount > 0) {
            uint48 newHeadOrderId = metadata.firstChunkId == 0
                ? 0
                : metadata.chunks[metadata.firstChunkId].firstOrderId;

            if (newHeadOrderId == 0) {
                _setHead(self, value, 0);
                _setTail(self, value, 0);
            } else {
                _setHead(self, value, newHeadOrderId);
                gn.orders[newHeadOrderId].prev = 0;
            }

            gn.orderCounter -= fullyRemovedCount;
            gn.orderTotalAmount -= fullyRemovedAmount;
        }

        if (partiallyRemovedAmount > 0) {
            OrderItem storage partialOrder = gn.orders[partiallyRemovedOrderId];
            require(
                partialOrder.orderId == partiallyRemovedOrderId &&
                    partialOrder.amount > partiallyRemovedAmount,
                "OSTLib: Invalid partial removal"
            );

            partialOrder.amount -= partiallyRemovedAmount;
            gn.orderTotalAmount -= partiallyRemovedAmount;
            partiallyRemovedOrder = PartiallyRemovedOrder(
                partiallyRemovedOrderId,
                partialOrder.maker,
                partiallyRemovedAmount,
                _calculateFutureValue(value, partiallyRemovedAmount)
            );
        }
    }

    function migrateOrderChunks(Tree storage self, uint256 value) internal {
        Node storage gn = self.nodes[value];
        PriceChunkMetadata storage metadata = self.chunkMetadata[value];

        require(exists(self, value), "Value does not exist");
        require(gn.orderCounter > 0, "No orders to migrate");

        require(metadata.firstChunkId == 0, "Already migrated");
        _migrateChunkMetadata(self, value);
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

    function _calculateDroppedAmountFromLeft(
        Tree storage self,
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue,
        uint256 firstValue
    )
        private
        view
        returns (
            uint256 droppedValue,
            uint256 cursor,
            uint256 cursorNodeAmount,
            uint256 droppedAmount,
            uint256 droppedAmountInFV,
            uint256 exceededAmount,
            uint256 exceededAmountInFV
        )
    {
        cursor = firstValue;

        while (
            (droppedAmount < amount || amount == EMPTY) &&
            (droppedAmountInFV < amountInFV || amountInFV == EMPTY) &&
            cursor != EMPTY &&
            (cursor <= limitValue || limitValue == EMPTY)
        ) {
            cursorNodeAmount = self.nodes[cursor].orderTotalAmount;
            droppedValue = cursor;

            droppedAmountInFV += _calculateFutureValue(cursor, cursorNodeAmount);
            droppedAmount += cursorNodeAmount;

            if (droppedAmount > amount && amount != EMPTY) {
                exceededAmount = droppedAmount - amount;
                exceededAmountInFV = _calculateFutureValue(cursor, exceededAmount);
            } else if (droppedAmountInFV > amountInFV && amountInFV != EMPTY) {
                exceededAmountInFV = droppedAmountInFV - amountInFV;
                exceededAmount = _calculatePresentValue(cursor, exceededAmountInFV);
            }

            cursor = next(self, cursor);
        }

        if (exceededAmount > 0) {
            droppedAmount -= exceededAmount;
        }
        if (exceededAmountInFV > 0) {
            droppedAmountInFV -= exceededAmountInFV;
        }
    }

    function _calculateDroppedAmountFromRight(
        Tree storage self,
        uint256 amount,
        uint256 amountInFV,
        uint256 limitValue,
        uint256 lastValue
    )
        private
        view
        returns (
            uint256 droppedValue,
            uint256 cursor,
            uint256 cursorNodeAmount,
            uint256 droppedAmount,
            uint256 droppedAmountInFV,
            uint256 exceededAmount,
            uint256 exceededAmountInFV
        )
    {
        cursor = lastValue;

        while (
            (droppedAmount < amount || amount == EMPTY) &&
            (droppedAmountInFV < amountInFV || amountInFV == EMPTY) &&
            cursor != EMPTY &&
            (cursor >= limitValue || limitValue == EMPTY)
        ) {
            cursorNodeAmount = self.nodes[cursor].orderTotalAmount;
            droppedValue = cursor;

            droppedAmountInFV += _calculateFutureValue(cursor, cursorNodeAmount);
            droppedAmount += cursorNodeAmount;

            if (droppedAmount > amount && amount != EMPTY) {
                exceededAmount = droppedAmount - amount;
                exceededAmountInFV = _calculateFutureValue(cursor, exceededAmount);
            } else if (droppedAmountInFV > amountInFV && amountInFV != EMPTY) {
                exceededAmountInFV = droppedAmountInFV - amountInFV;
                exceededAmount = _calculatePresentValue(cursor, exceededAmountInFV);
            }

            cursor = prev(self, cursor);
        }

        if (exceededAmount > 0) {
            droppedAmount -= exceededAmount;
        }
        if (exceededAmountInFV > 0) {
            droppedAmountInFV -= exceededAmountInFV;
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
        require(gn.orders[orderId].maker == address(0), "OSTLib: Order id already exists");

        gn.orderCounter += 1;
        gn.orderTotalAmount += amount;
        OrderItem memory order = OrderItem(orderId, 0, 0, user, amount);
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
        require(isActiveOrderId(self, value, orderId), "OSTLib: Order does not exist");
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
     * @dev Internal function to update the Head pointer.
     */
    function _setHead(Tree storage self, uint256 value, uint48 orderId) internal {
        Node storage gn = self.nodes[value];

        gn.head = orderId;
    }

    /**
     * @dev Internal function to update the Tail pointer.
     */
    function _setTail(Tree storage self, uint256 value, uint48 orderId) internal {
        Node storage gn = self.nodes[value];

        gn.tail = orderId;
    }

    /**
     * @dev Internal function to link an Object to another.
     */
    function _link(Tree storage self, uint256 value, uint48 prevId, uint48 nextId) internal {
        Node storage gn = self.nodes[value];

        gn.orders[prevId].next = nextId;
        gn.orders[nextId].prev = prevId;
    }

    function _ensureChunkMetadata(Tree storage self, uint256 value) private {
        PriceChunkMetadata storage metadata = self.chunkMetadata[value];

        if (self.nodes[value].orderCounter > 0 && metadata.firstChunkId == 0) {
            _migrateChunkMetadata(self, value);
        }
    }

    function _migrateChunkMetadata(Tree storage self, uint256 value) private {
        Node storage gn = self.nodes[value];
        PriceChunkMetadata storage metadata = self.chunkMetadata[value];

        uint48 orderId = gn.head;
        while (orderId != 0) {
            OrderItem storage order = gn.orders[orderId];
            _addOrderToChunk(metadata, orderId, order.amount);
            orderId = order.next;
        }
    }

    function _addOrderToChunk(
        PriceChunkMetadata storage metadata,
        uint48 orderId,
        uint256 amount
    ) private {
        uint32 chunkId = metadata.lastChunkId;

        if (chunkId == 0 || metadata.chunks[chunkId].orderCount == ORDER_CHUNK_SIZE) {
            require(
                metadata.activeChunkCount < MAX_ACTIVE_CHUNKS_PER_PRICE,
                "OSTLib: Too many orders"
            );

            uint32 newChunkId = metadata.lastAllocatedChunkId + 1;
            delete metadata.chunks[newChunkId];

            OrderChunk storage newChunk = metadata.chunks[newChunkId];
            newChunk.prevChunkId = metadata.lastChunkId;

            bool wasSingleChunk = metadata.firstChunkId == metadata.lastChunkId &&
                metadata.lastChunkId != 0;

            if (metadata.lastChunkId != 0) {
                metadata.chunks[metadata.lastChunkId].nextChunkId = newChunkId;
            } else {
                metadata.firstChunkId = newChunkId;
            }

            metadata.lastChunkId = newChunkId;
            metadata.lastAllocatedChunkId = newChunkId;
            metadata.activeChunkCount += 1;
            chunkId = newChunkId;

            if (wasSingleChunk) {
                metadata.explicitMappingStartOrderId = orderId;
            }
        }

        OrderChunk storage chunk = metadata.chunks[chunkId];
        if (chunk.orderCount == 0) {
            chunk.firstOrderId = orderId;
        }
        chunk.totalAmount += amount;
        chunk.orderCount += 1;

        if (metadata.firstChunkId != metadata.lastChunkId) {
            metadata.orderChunkIds[orderId] = chunkId;
        }
    }

    /**
     * @dev Orders created before explicitMappingStartOrderId belong to the first chunk.
     * This lookup relies on order IDs increasing monotonically.
     */
    function _getActiveOrderChunkId(
        PriceChunkMetadata storage metadata,
        uint48 orderId
    ) private view returns (uint32 chunkId) {
        uint32 firstChunkId = metadata.firstChunkId;

        if (
            firstChunkId == metadata.lastChunkId || orderId < metadata.explicitMappingStartOrderId
        ) {
            return firstChunkId;
        }

        return metadata.orderChunkIds[orderId];
    }

    function _removeOrderFromChunk(
        PriceChunkMetadata storage metadata,
        uint48 orderId,
        uint256 amount,
        uint48 nextOrderId
    ) private {
        uint32 chunkId = _getActiveOrderChunkId(metadata, orderId);
        require(chunkId != 0, "OSTLib: Chunk not found");

        OrderChunk storage chunk = metadata.chunks[chunkId];
        chunk.totalAmount -= amount;
        chunk.orderCount -= 1;

        if (chunk.orderCount == 0) {
            _unlinkChunk(metadata, chunkId);
        } else if (chunk.firstOrderId == orderId) {
            chunk.firstOrderId = nextOrderId;
        }
    }

    function _removeOrdersFromBoundaryChunk(
        Node storage gn,
        OrderChunk storage chunk,
        uint256 amount
    )
        private
        returns (
            uint256 removedAmount,
            uint256 removedCount,
            uint48 partiallyRemovedOrderId,
            uint256 partiallyRemovedAmount,
            uint256 remainingAmount
        )
    {
        remainingAmount = amount;
        uint48 orderId = chunk.firstOrderId;

        while (orderId != 0 && remainingAmount > 0) {
            OrderItem storage currentOrder = gn.orders[orderId];
            uint48 nextOrderId = currentOrder.next;

            if (currentOrder.amount <= remainingAmount) {
                remainingAmount -= currentOrder.amount;
                removedAmount += currentOrder.amount;
                removedCount += 1;
                orderId = nextOrderId;
            } else {
                partiallyRemovedOrderId = orderId;
                partiallyRemovedAmount = remainingAmount;
                remainingAmount = 0;
            }
        }

        chunk.totalAmount -= removedAmount + partiallyRemovedAmount;
        chunk.orderCount -= uint16(removedCount);
        chunk.firstOrderId = partiallyRemovedOrderId != 0 ? partiallyRemovedOrderId : orderId;
    }

    function _unlinkChunkPrefix(
        PriceChunkMetadata storage metadata,
        uint32 firstRemainingChunkId,
        uint32 removedChunkCount
    ) private {
        metadata.activeChunkCount -= removedChunkCount;

        if (firstRemainingChunkId == 0) {
            metadata.firstChunkId = 0;
            metadata.lastChunkId = 0;
            metadata.explicitMappingStartOrderId = 0;
        } else {
            metadata.firstChunkId = firstRemainingChunkId;
            metadata.chunks[firstRemainingChunkId].prevChunkId = 0;

            if (metadata.firstChunkId == metadata.lastChunkId) {
                metadata.explicitMappingStartOrderId = 0;
            }
        }
    }

    function _unlinkChunk(PriceChunkMetadata storage metadata, uint32 chunkId) private {
        OrderChunk storage chunk = metadata.chunks[chunkId];
        uint32 prevChunkId = chunk.prevChunkId;
        uint32 nextChunkId = chunk.nextChunkId;

        if (prevChunkId == 0) {
            metadata.firstChunkId = nextChunkId;
        } else {
            metadata.chunks[prevChunkId].nextChunkId = nextChunkId;
        }

        if (nextChunkId == 0) {
            metadata.lastChunkId = prevChunkId;
        } else {
            metadata.chunks[nextChunkId].prevChunkId = prevChunkId;
        }

        metadata.activeChunkCount -= 1;

        if (metadata.firstChunkId == metadata.lastChunkId) {
            metadata.explicitMappingStartOrderId = 0;
        }
    }

    function _calculateFutureValue(
        uint256 unitPrice,
        uint256 amount
    ) internal pure returns (uint256) {
        return (amount * Constants.PRICE_DIGIT).div(unitPrice);
    }

    function _calculatePresentValue(
        uint256 unitPrice,
        uint256 amount
    ) internal pure returns (uint256) {
        return (amount * unitPrice).div(Constants.PRICE_DIGIT);
    }
}
