// SPDX-License-Identifier: Apache 2.0
pragma solidity ^0.6.12;

/**
 * @title LinkedList
 * @dev Data structure
 * @author Alberto Cuesta Cañada with Bach Adylbekov changes
 */
contract DoubleLinkedList {

    event ObjectCreated(uint256 orderId, uint256 amount);
    event ObjectsLinked(uint256 prev, uint256 next);
    event ObjectRemoved(uint256 orderId);
    event NewHead(uint256 orderId);
    event NewTail(uint256 orderId);

    struct Object{
        uint256 orderId;
        uint256 next;
        uint256 prev;
        uint256 timestamp;
        uint256 amount;
    }

    uint256 public head;
    uint256 public tail;
    uint256 public idCounter;
    mapping (uint256 => Object) public objects;

    /**
     * @dev Creates an empty list.
     */
    constructor() public {
        head = 0;
        tail = 0;
        idCounter = 1;
    }

    /**
     * @dev Retrieves the Object denoted by `_id`.
     */
    function get(uint256 _id)
        public
        virtual
        view
        returns (uint256, uint256, uint256, uint256, uint256)
    {
        Object memory object = objects[_id];
        return (object.orderId, object.next, object.prev, object.timestamp, object.amount);
    }

    /**
     * @dev Return the id of the first Object matching `_amount` in the amount field.
     */
    function findIdForAmount(uint256 _amount)
        public
        virtual
        view
        returns (uint256)
    {
        Object memory object = objects[head];
        while (object.amount != _amount) {
            object = objects[object.next];
        }
        return object.orderId;
    }

    /**
     * @dev Insert a new Object as the new Head with `_amount` in the amount field, and orderId.
     */
    function addHead(uint256 _amount, uint256 _orderId)
        public
        virtual
    {
        uint256 objectId = _createObject(_amount, _orderId);
        _link(objectId, head);
        _setHead(objectId);
        if (tail == 0) _setTail(objectId);
    }

    /**
     * @dev Insert a new Object as the new Tail with `_amount` in the amount field, and orderId.
     */
    function addTail(uint256 _amount, uint256 _orderId)
        public
        virtual
    {
        if (head == 0) {
            addHead(_amount, _orderId);
        }
        else {
            uint256 objectId = _createObject(_amount, _orderId);
            _link(tail, objectId);
            _setTail(objectId);
        }
    }

    /**
     * @dev Remove the Object denoted by `_id` from the List.
     */
    function remove(uint256 _orderId)
        public
        virtual
    {
        Object memory removeObject = objects[_orderId];
        if (head == _orderId && tail == _orderId) {
            _setHead(0);
            _setTail(0);
        }
        else if (head == _orderId) {
            _setHead(removeObject.next);
            objects[removeObject.next].prev = 0;
        }
        else if (tail == _orderId) {
            _setTail(removeObject.prev);
            objects[removeObject.prev].next = 0;
        }
        else {
            _link(removeObject.prev, removeObject.next);
        }
        delete objects[removeObject.orderId];
        emit ObjectRemoved(_orderId);
    }

    /**
    * @dev Insert a new Object after the last Object with the same `_amount`.
    */
    function insert(uint256 _amount, uint256 _orderId) public virtual {
        require(_amount > 0, "Insuficient amount");

        if (head == 0) {
            addHead(_amount, _orderId);
        } else {
            if (objects[head].amount < _amount) {
                Object memory object = objects[head];
                while (object.next != 0 && object.amount <= _amount) {
                    object = objects[object.next];
                }
                if (object.amount > _amount) {
                    insertBefore(object.orderId, _amount, _orderId);
                } else {
                    insertAfter(object.orderId, _amount, _orderId);
                }
            } else {
                addHead(_amount, _orderId);
            }
        }
    }

    /**
     * @dev Insert a new Object after the Object denoted by `_id` with `_amount` and `_orderId` in the amount field.
     */
    function insertAfter(uint256 _prevId, uint256 _amount, uint256 _orderId)
        public
        virtual
    {
        if (_prevId == tail) {
            addTail(_amount, _orderId);
        }
        else {
            Object memory prevObject = objects[_prevId];
            Object memory nextObject = objects[prevObject.next];
            uint256 newObjectId = _createObject(_amount, _orderId);
            _link(newObjectId, nextObject.orderId);
            _link(prevObject.orderId, newObjectId);
        }
    }

    /**
     * @dev Insert a new Object before the Object denoted by `_id` with `_amount` and `_orderId` in the data field.
     */
    function insertBefore(uint256 _nextId, uint256 _amount, uint256 _orderId)
        public
        virtual
    {
        if (_nextId == head) {
            addHead(_amount, _orderId);
        }
        else {
            insertAfter(objects[_nextId].prev, _amount, _orderId);
        }
    }

    /**
     * @dev Internal function to update the Head pointer.
     */
    function _setHead(uint256 _orderId)
        internal
    {
        head = _orderId;
        emit NewHead(_orderId);
    }

    /**
     * @dev Internal function to update the Tail pointer.
     */
    function _setTail(uint256 _orderId)
        internal
    {
        tail = _orderId;
        emit NewTail(_orderId);
    }

    /**
     * @dev Internal function to create an unlinked Object.
     */
    function _createObject(uint256 _amount, uint256 _orderId)
        internal
        returns (uint256)
    {
        idCounter += 1;
        Object memory object = Object(
            _orderId,
            0,
            0,
            block.timestamp,
            _amount
        );
        objects[object.orderId] = object;
        emit ObjectCreated(
            object.orderId,
            object.amount
        );
        return object.orderId;
    }

    /**
     * @dev Internal function to link an Object to another.
     */
    function _link(uint256 _prevId, uint256 _nextId)
        internal
    {
        objects[_prevId].next = _nextId;
        objects[_nextId].prev = _prevId;
        emit ObjectsLinked(_prevId, _nextId);
    }
}
