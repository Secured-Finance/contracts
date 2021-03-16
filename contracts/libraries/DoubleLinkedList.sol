// SPDX-License-Identifier: Apache 2.0
pragma solidity ^0.6.0;


/**
 * @title LinkedList
 * @dev Data structure
 * @author Alberto Cuesta Cañada with Bach Adylbekov changes
 */
contract DoubleLinkedList {

    event ObjectCreated(uint256 id, uint256 amount, uint256 orderId);
    event ObjectsLinked(uint256 prev, uint256 next);
    event ObjectRemoved(uint256 id);
    event NewHead(uint256 id);
    event NewTail(uint256 id);

    struct Object{
        uint256 id;
        uint256 next;
        uint256 prev;
        uint256 timestamp;
        uint256 amount;
        uint256 orderId;
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
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        Object memory object = objects[_id];
        return (object.id, object.next, object.prev, object.timestamp, object.amount, object.orderId);
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
        return object.id;
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
    function remove(uint256 _id)
        public
        virtual
    {
        Object memory removeObject = objects[_id];
        if (head == _id && tail == _id) {
            _setHead(0);
            _setTail(0);
        }
        else if (head == _id) {
            _setHead(removeObject.next);
            objects[removeObject.next].prev = 0;
        }
        else if (tail == _id) {
            _setTail(removeObject.prev);
            objects[removeObject.prev].next = 0;
        }
        else {
            _link(removeObject.prev, removeObject.next);
        }
        delete objects[removeObject.id];
        emit ObjectRemoved(_id);
    }

    /**
    * @dev Insert a new Object after the last Object with the same `_amount`.
    */
    function insert(uint256 _amount, uint256 _orderId) public virtual {
        require(_amount > 0, "Insuficient amount");

        if (head == 0) {
            addHead(_amount, _orderId);
        } else {
            if (objects[head].amount <= _amount) {
                Object memory object = objects[head];
                while (object.next != 0 && object.amount <= _amount) {
                    object = objects[object.next];
                }
                insertAfter(object.id, _amount, _orderId);
            } else {
                Object memory object = objects[head];
                while (object.next != 0 && !(object.amount <= _amount)) {
                    object = objects[object.next];
                }
                insertBefore(object.id, _amount, _orderId);
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
            _link(newObjectId, nextObject.id);
            _link(prevObject.id, newObjectId);
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
    function _setHead(uint256 _id)
        internal
    {
        head = _id;
        emit NewHead(_id);
    }

    /**
     * @dev Internal function to update the Tail pointer.
     */
    function _setTail(uint256 _id)
        internal
    {
        tail = _id;
        emit NewTail(_id);
    }

    /**
     * @dev Internal function to create an unlinked Object.
     */
    function _createObject(uint256 _amount, uint256 _orderId)
        internal
        returns (uint256)
    {
        uint256 newId = idCounter;
        idCounter += 1;
        Object memory object = Object(
            newId,
            0,
            0,
            block.timestamp,
            _amount,
            _orderId
        );
        objects[object.id] = object;
        emit ObjectCreated(
            object.id,
            object.amount,
            object.orderId
        );
        return object.id;
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
