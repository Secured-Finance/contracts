// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

library HitchensOrderStatisticsTreeLib {
    uint256 private constant EMPTY = 0;
    struct Node {
        uint256 parent;
        uint256 left;
        uint256 right;
        bool red;
        uint256 head;
        uint256 tail;
        uint256 orderCounter;
        mapping (uint256 => OrderItem) orders;
    }

    struct OrderItem{
        uint256 id;
        uint256 next;
        uint256 prev;
        uint256 timestamp;
        address owner;
        uint256 amount;
        uint256 orderId;
    }

    struct Tree {
        uint256 root;
        mapping(uint256 => Node) nodes;
    }
    function first(Tree storage self) internal view returns (uint256 _value) {
        _value = self.root;
        if(_value == EMPTY) return 0;
        while (self.nodes[_value].left != EMPTY) {
            _value = self.nodes[_value].left;
        }
    }
    function last(Tree storage self) internal view returns (uint256 _value) {
        _value = self.root;
        if(_value == EMPTY) return 0;
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
        if(value == EMPTY) return false;
        if(value == self.root) return true;
        if(self.nodes[value].parent != EMPTY) return true;
        return false;       
    }
    function amountExistsInNode(Tree storage self, uint256 amount, uint256 value) internal view returns (bool) {
        if(!exists(self, value)) return false;
        return isAmountExistsInList(self, value, amount);
    } 
    function orderExistsInNode(Tree storage self, uint256 amount, uint256 value, uint256 orderId, uint256 _id) internal view returns (bool) {
        if(!exists(self, value)) return false;
        return isOrderIdExists(self, value, amount, orderId, _id);
    } 
    function getNode(Tree storage self, uint256 value) internal view returns (uint256, uint256, uint256, bool, uint256, uint256, uint256) {        
        require(exists(self,value), "OrderStatisticsTree(403) - Value does not exist.");
        Node storage gn = self.nodes[value];
        return(gn.parent, gn.left, gn.right, gn.red, gn.head, gn.tail, gn.orderCounter);
    }
    function getNodeCount(Tree storage self, uint256 value) internal view returns(uint256) {
        Node storage gn = self.nodes[value];
        return gn.orderCounter;
    }
    function count(Tree storage self) internal view returns(uint256 _count) {
        return getNodeCount(self,self.root);
    }
    function insert(Tree storage self, uint256 amount, uint256 value, uint256 orderId) internal {
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
                insertOrder(self, probe, amount, orderId);
                return;
            }
        }
        Node storage nValue = self.nodes[value];
        nValue.parent = cursor;
        nValue.left = EMPTY;
        nValue.right = EMPTY;
        nValue.red = true;
        insertOrder(self, value, amount, orderId);
        if (cursor == EMPTY) {
            self.root = value;
        } else if (value < cursor) {
            self.nodes[cursor].left = value;
        } else {
            self.nodes[cursor].right = value;
        }
        insertFixup(self, value);
    }
    function remove(Tree storage self, uint256 amount, uint256 value, uint256 orderId, uint256 _id) internal {
        require(value != EMPTY, "OrderStatisticsTree(407) - Value to delete cannot be zero");
        require(orderExistsInNode(self,amount,value,orderId, _id), "OrderStatisticsTree(408) - Value to delete does not exist.");
        Node storage nValue = self.nodes[value];
        removeOrder(self, value, _id);
        uint256 probe;
        uint256 cursor;
        if(nValue.orderCounter == 0) {
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
                if (!self.nodes[self.nodes[cursor].left].red && !self.nodes[self.nodes[cursor].right].red) {
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
                if (!self.nodes[self.nodes[cursor].right].red && !self.nodes[self.nodes[cursor].left].red) {
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

    // Double linked list functions
    /**
     * @dev Retrieves the Object denoted by `_id`.
     */
    function getOrderById(Tree storage self, uint256 value, uint256 _id)
        internal
        view
        returns (uint256, uint256, uint256, uint256, address, uint256, uint256)
    {
        require(exists(self,value), "OrderStatisticsTree(403) - Value does not exist.");
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[_id];
        return (order.id, order.next, order.prev, order.timestamp, order.owner, order.amount, order.orderId);
    }

    /**
    * @dev Return boolean if value, amount and orderId exist in doubly linked list
    */
    function isOrderIdExists(Tree storage self, uint256 value, uint256 amount, uint256 orderId, uint256 _id) internal view returns (bool) {
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[_id];
        if (order.amount != amount && order.orderId != orderId) {
            return false;
        }

        return true;
    }

    /**
     * @dev Return boolean if value and amount exist in doubly linked list.
     */
    function isAmountExistsInList(Tree storage self, uint256 value, uint256 amount)
        internal
        view
        returns (bool)
    {        
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[gn.head];
        while (order.next != 0 && order.amount < amount) {
            order = gn.orders[order.next];
        }
        if (order.amount == 0) {
            return false;
        }
        return true;
    }

    /**
     * @dev Return the id of the first OrderItem matching `_amount` in the amount field.
     */
    function findOrderIdForAmount(Tree storage self, uint256 value, uint256 amount)
        internal
        view
        returns (uint256)
    {        
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[gn.head];
        while (order.next != 0 && order.amount <= amount) {
            order = gn.orders[order.next];
        }
        return order.id;
    }

    /**
     * @dev Insert a new OrderItem as the new Head with `_amount` in the amount field, and orderId.
     */
    function addHead(Tree storage self, uint256 value, uint256 _amount, uint256 _orderId)
        internal
    {
        Node storage gn = self.nodes[value];
        uint256 orderId = _createOrder(self, value, _amount, _orderId);
        _link(self, value, orderId, gn.head);
        _setHead(self, value, orderId);
        if (gn.tail == 0) _setTail(self, value, orderId);
    }

    /**
     * @dev Insert a new OrderItem as the new Tail with `_amount` in the amount field, and orderId.
     */
    function addTail(Tree storage self, uint256 value, uint256 _amount, uint256 _orderId)
        internal
    {
        Node storage gn = self.nodes[value];

        if (gn.head == 0) {
            addHead(self, value, _amount, _orderId);
        }
        else {
            uint256 orderId = _createOrder(self, value, _amount, _orderId);
            _link(self, value, gn.tail, orderId);
            _setTail(self, value, orderId);
        }
    }
    /**
     * @dev Remove the OrderItem denoted by `_id` from the List.
     */
    function removeOrder(Tree storage self, uint256 value, uint256 _id)
        internal
    {
        require(exists(self,value), "OrderStatisticsTree(403) - Value does not exist.");
        Node storage gn = self.nodes[value];

        OrderItem memory order = gn.orders[_id];
        require(order.owner == msg.sender, "Order can be deleted by owner");
        if (gn.head == _id && gn.tail == _id) {
            _setHead(self, value, 0);
            _setTail(self, value, 0);
        }
        else if (gn.head == _id) {
            _setHead(self, value, order.next);
            gn.orders[order.next].prev = 0;
        }
        else if (gn.tail == _id) {
            _setTail(self, value, order.prev);
            gn.orders[order.prev].next = 0;
        }
        else {
            _link(self, value, order.prev, order.next);
        }
        delete gn.orders[order.id];
        gn.orderCounter -= 1;
    }

    /**
    * @dev Insert a new OrderItem after the last OrderItem with the same `_amount`.
    */
    function insertOrder(Tree storage self, uint256 value, uint256 _amount, uint256 _orderId) internal {
        require(_amount > 0, "Insuficient amount");

        Node storage gn = self.nodes[value];
        if (gn.head == 0) {
            addHead(self, value, _amount, _orderId);
        } else {
            if (gn.orders[gn.head].amount <= _amount) {
                OrderItem memory order = gn.orders[gn.head];
                while (order.next != 0 && order.amount <= _amount) {
                    order = gn.orders[order.next];
                }
                insertOrderAfter(self, value, order.id, _amount, _orderId);
            } else {
                OrderItem memory order = gn.orders[gn.head];
                while (order.next != 0 && !(order.amount <= _amount)) {
                    order = gn.orders[order.next];
                }
                insertOrderBefore(self, value, order.id, _amount, _orderId);
            }
        }
    }

    /**
     * @dev Insert a new OrderImer after the Order denoted by `_id` with `_amount` and `_orderId` in the amount field.
     */
    function insertOrderAfter(Tree storage self, uint256 value, uint256 _prevId, uint256 _amount, uint256 _orderId)
        internal
    {
        require(_amount > 0, "Insuficient amount");

        Node storage gn = self.nodes[value];

        if (_prevId == gn.tail) {
            addTail(self, value, _amount, _orderId);
        }
        else {
            OrderItem memory prevOrder = gn.orders[_prevId];
            OrderItem memory nextOrder = gn.orders[prevOrder.next];
            uint256 newOrderId = _createOrder(self, value, _amount, _orderId);
            _link(self, value, newOrderId, nextOrder.id);
            _link(self, value, prevOrder.id, newOrderId);
        }
    }

    /**
     * @dev Insert a new Object before the Object denoted by `_id` with `_amount` and `_orderId` in the data field.
     */
    function insertOrderBefore(Tree storage self, uint256 value, uint256 _nextId, uint256 _amount, uint256 _orderId)
        internal
    {
        Node storage gn = self.nodes[value];

        if (_nextId == gn.head) {
            addHead(self, value, _amount, _orderId);
        }
        else {
            insertOrderAfter(self, value, gn.orders[_nextId].prev, _amount, _orderId);
        }
    }

    /**
     * @dev Internal function to update the Head pointer.
     */
    function _setHead(Tree storage self, uint256 value, uint256 _id)
        internal
    {
        Node storage gn = self.nodes[value];

        gn.head = _id;
    }

    /**
     * @dev Internal function to update the Tail pointer.
     */
    function _setTail(Tree storage self, uint256 value, uint256 _id)
        internal
    {
        Node storage gn = self.nodes[value];

        gn.tail = _id;
    }

    /**
     * @dev Internal function to create an unlinked Order.
     */
    function _createOrder(Tree storage self, uint256 value, uint256 _amount, uint256 _orderId)
        internal
        returns (uint256)
    {
        Node storage gn = self.nodes[value];
        uint256 newId;
        if (gn.orderCounter == 0) {
            newId = 1;
        }
        gn.orderCounter += 1;
        OrderItem memory order = OrderItem(
            newId,
            0,
            0,
            block.timestamp,
            msg.sender,
            _amount,
            _orderId
        );
        gn.orders[order.id] = order;
        return order.id;
    }

    /**
     * @dev Internal function to link an Object to another.
     */
    function _link(Tree storage self, uint256 value, uint256 _prevId, uint256 _nextId)
        internal
    {
        Node storage gn = self.nodes[value];

        gn.orders[_prevId].next = _nextId;
        gn.orders[_nextId].prev = _prevId;
    }

}