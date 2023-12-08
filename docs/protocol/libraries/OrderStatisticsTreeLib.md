# Solidity API

## RemainingOrder

```solidity
struct RemainingOrder {
  uint48 orderId;
  address maker;
  uint256 amount;
  uint256 unitPrice;
}
```

## PartiallyRemovedOrder

```solidity
struct PartiallyRemovedOrder {
  uint48 orderId;
  address maker;
  uint256 amount;
  uint256 futureValue;
}
```

## OrderStatisticsTreeLib

OrderStatisticsTreeLib is a Red-Black Tree binary search library
based on the following library that is extended to manage order data.

https://github.com/rob-Hitchens/OrderStatisticsTree

### EMPTY

```solidity
uint256 EMPTY
```

### Node

```solidity
struct Node {
  uint256 parent;
  uint256 left;
  uint256 right;
  bool red;
  uint48 head;
  uint48 tail;
  uint256 orderCounter;
  uint256 orderTotalAmount;
  mapping(uint48 => struct OrderStatisticsTreeLib.OrderItem) orders;
}
```

### Tree

```solidity
struct Tree {
  uint256 root;
  mapping(uint256 => struct OrderStatisticsTreeLib.Node) nodes;
}
```

### OrderItem

```solidity
struct OrderItem {
  uint48 orderId;
  uint48 next;
  uint48 prev;
  address maker;
  uint256 amount;
}
```

### first

```solidity
function first(struct OrderStatisticsTreeLib.Tree self) internal view returns (uint256 value)
```

### last

```solidity
function last(struct OrderStatisticsTreeLib.Tree self) internal view returns (uint256 value)
```

### hasOrders

```solidity
function hasOrders(struct OrderStatisticsTreeLib.Tree self) internal view returns (bool)
```

### next

```solidity
function next(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 cursor)
```

### prev

```solidity
function prev(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 cursor)
```

### search

```solidity
function search(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (bool valueExists, uint256 parent)
```

### exists

```solidity
function exists(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (bool)
```

### isActiveOrderId

```solidity
function isActiveOrderId(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (bool)
```

### getNode

```solidity
function getNode(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256, uint256, uint256, bool, uint256, uint256, uint256, uint256)
```

### getNodeCount

```solidity
function getNodeCount(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256)
```

### getNodeTotalAmount

```solidity
function getNodeTotalAmount(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 totalAmount)
```

### getNodeOrderIds

```solidity
function getNodeOrderIds(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint48[] orderIds)
```

### count

```solidity
function count(struct OrderStatisticsTreeLib.Tree self) internal view returns (uint256)
```

### insert

```solidity
function insert(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal
```

### remove

```solidity
function remove(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal
```

### treeMinimum

```solidity
function treeMinimum(struct OrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256)
```

### treeMaximum

```solidity
function treeMaximum(struct OrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256)
```

### rotateLeft

```solidity
function rotateLeft(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### rotateRight

```solidity
function rotateRight(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### insertFixup

```solidity
function insertFixup(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### replaceParent

```solidity
function replaceParent(struct OrderStatisticsTreeLib.Tree self, uint256 a, uint256 b) private
```

### removeFixup

```solidity
function removeFixup(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### calculateDroppedAmountFromLeft

```solidity
function calculateDroppedAmountFromLeft(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal view returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV)
```

### calculateDroppedAmountFromRight

```solidity
function calculateDroppedAmountFromRight(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal view returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV)
```

### dropLeft

```solidity
function dropLeft(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV, uint256 remainingAmount, struct PartiallyRemovedOrder partiallyRemovedOrder)
```

### dropRight

```solidity
function dropRight(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV, uint256 remainingAmount, struct PartiallyRemovedOrder partiallyRemovedOrder)
```

### rotateTreeToLeft

```solidity
function rotateTreeToLeft(struct OrderStatisticsTreeLib.Tree self) internal
```

### rotateTreeToRight

```solidity
function rotateTreeToRight(struct OrderStatisticsTreeLib.Tree self) internal
```

### getFutureValue

```solidity
function getFutureValue(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (uint256)
```

### getOrderById

```solidity
function getOrderById(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (address maker, uint256 amount)
```

_Retrieves the Object denoted by `_id`._

### orderIdExists

```solidity
function orderIdExists(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (bool)
```

_Return boolean if value, amount and orderId exist in doubly linked list_

### insertOrder

```solidity
function insertOrder(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId, address user, uint256 amount) internal
```

### removeOrder

```solidity
function removeOrder(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal returns (uint256 amount)
```

### removeOrders

```solidity
function removeOrders(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint256 _amount) internal returns (struct PartiallyRemovedOrder partiallyRemovedOrder)
```

### addHead

```solidity
function addHead(struct OrderStatisticsTreeLib.Tree self, uint256 _value, uint48 _orderId, address _user, uint256 _amount) internal
```

_Insert a new OrderItem as the new Head with `_amount` in the amount field, and orderId._

### addTail

```solidity
function addTail(struct OrderStatisticsTreeLib.Tree self, uint256 _value, uint48 _orderId, address _user, uint256 _amount) internal
```

_Insert a new OrderItem as the new Tail with `_amount` in the amount field, and orderId._

### _calculateDroppedAmountFromLeft

```solidity
function _calculateDroppedAmountFromLeft(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue, uint256 firstValue) private view returns (uint256 droppedValue, uint256 cursor, uint256 cursorNodeAmount, uint256 droppedAmount, uint256 droppedAmountInFV, uint256 exceededAmount, uint256 exceededAmountInFV)
```

### _calculateDroppedAmountFromRight

```solidity
function _calculateDroppedAmountFromRight(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue, uint256 lastValue) private view returns (uint256 droppedValue, uint256 cursor, uint256 cursorNodeAmount, uint256 droppedAmount, uint256 droppedAmountInFV, uint256 exceededAmount, uint256 exceededAmountInFV)
```

### _createOrder

```solidity
function _createOrder(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId, address user, uint256 amount) internal returns (uint48)
```

_Internal function to create an unlinked Order._

### _removeOrder

```solidity
function _removeOrder(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal returns (uint256 amount)
```

_Remove the OrderItem denoted by `_id` from the list._

### _removeOrders

```solidity
function _removeOrders(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal
```

_Remove the OrderItems older than or equal `orderId` from the list_

### _setHead

```solidity
function _setHead(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal
```

_Internal function to update the Head pointer._

### _setTail

```solidity
function _setTail(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal
```

_Internal function to update the Tail pointer._

### _link

```solidity
function _link(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 prevId, uint48 nextId) internal
```

_Internal function to link an Object to another._

### _calculateFutureValue

```solidity
function _calculateFutureValue(uint256 unitPrice, uint256 amount) internal pure returns (uint256)
```

### _calculatePresentValue

```solidity
function _calculatePresentValue(uint256 unitPrice, uint256 amount) internal pure returns (uint256)
```

