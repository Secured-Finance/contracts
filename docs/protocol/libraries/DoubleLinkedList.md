# Solidity API

## DoubleLinkedList

_Data structure_

### ObjectCreated

```solidity
event ObjectCreated(uint256 orderId, uint256 amount)
```

### ObjectsLinked

```solidity
event ObjectsLinked(uint256 prev, uint256 next)
```

### ObjectRemoved

```solidity
event ObjectRemoved(uint256 orderId)
```

### NewHead

```solidity
event NewHead(uint256 orderId)
```

### NewTail

```solidity
event NewTail(uint256 orderId)
```

### Object

```solidity
struct Object {
  uint256 orderId;
  uint256 next;
  uint256 prev;
  uint256 timestamp;
  uint256 amount;
}
```

### head

```solidity
uint256 head
```

### tail

```solidity
uint256 tail
```

### idCounter

```solidity
uint256 idCounter
```

### objects

```solidity
mapping(uint256 => struct DoubleLinkedList.Object) objects
```

### constructor

```solidity
constructor() public
```

_Creates an empty list._

### get

```solidity
function get(uint256 _id) public view virtual returns (uint256, uint256, uint256, uint256, uint256)
```

_Retrieves the Object denoted by `_id`._

### findIdForAmount

```solidity
function findIdForAmount(uint256 _amount) public view virtual returns (uint256)
```

_Return the id of the first Object matching `_amount` in the amount field._

### addHead

```solidity
function addHead(uint256 _amount, uint256 _orderId) public virtual
```

_Insert a new Object as the new Head with `_amount` in the amount field, and orderId._

### addTail

```solidity
function addTail(uint256 _amount, uint256 _orderId) public virtual
```

_Insert a new Object as the new Tail with `_amount` in the amount field, and orderId._

### remove

```solidity
function remove(uint256 _orderId) public virtual
```

_Remove the Object denoted by `_id` from the List._

### insert

```solidity
function insert(uint256 _amount, uint256 _orderId) public virtual
```

_Insert a new Object after the last Object with the same `_amount`._

### insertAfter

```solidity
function insertAfter(uint256 _prevId, uint256 _amount, uint256 _orderId) public virtual
```

_Insert a new Object after the Object denoted by `_id` with `_amount` and `_orderId` in the amount field._

### insertBefore

```solidity
function insertBefore(uint256 _nextId, uint256 _amount, uint256 _orderId) public virtual
```

_Insert a new Object before the Object denoted by `_id` with `_amount` and `_orderId` in the data field._

### _setHead

```solidity
function _setHead(uint256 _orderId) internal
```

_Internal function to update the Head pointer._

### _setTail

```solidity
function _setTail(uint256 _orderId) internal
```

_Internal function to update the Tail pointer._

### _createObject

```solidity
function _createObject(uint256 _amount, uint256 _orderId) internal returns (uint256)
```

_Internal function to create an unlinked Object._

### _link

```solidity
function _link(uint256 _prevId, uint256 _nextId) internal
```

_Internal function to link an Object to another._

