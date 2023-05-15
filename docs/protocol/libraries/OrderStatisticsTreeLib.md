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

## PartiallyFilledOrder

```solidity
struct PartiallyFilledOrder {
  uint48 orderId;
  address maker;
  uint256 amount;
  uint256 futureValue;
}
```

## OrderItem

```solidity
struct OrderItem {
  uint48 orderId;
  uint48 next;
  uint48 prev;
  address maker;
  uint256 timestamp;
  uint256 amount;
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
  mapping(uint256 => struct OrderItem) orders;
}
```

### Tree

```solidity
struct Tree {
  uint256 root;
  mapping(uint256 => struct OrderStatisticsTreeLib.Node) nodes;
}
```

### first

```solidity
function first(struct OrderStatisticsTreeLib.Tree self) internal view returns (uint256 _value)
```

### last

```solidity
function last(struct OrderStatisticsTreeLib.Tree self) internal view returns (uint256 _value)
```

### hasOrders

```solidity
function hasOrders(struct OrderStatisticsTreeLib.Tree self) internal view returns (bool)
```

### next

```solidity
function next(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 _cursor)
```

### prev

```solidity
function prev(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 _cursor)
```

### exists

```solidity
function exists(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (bool _exists)
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
function count(struct OrderStatisticsTreeLib.Tree self) internal view returns (uint256 _count)
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

### estimateDroppedAmountFromLeft

```solidity
function estimateDroppedAmountFromLeft(struct OrderStatisticsTreeLib.Tree self, uint256 targetFutureValue) internal view returns (uint256 droppedAmount)
```

### estimateDroppedAmountFromRight

```solidity
function estimateDroppedAmountFromRight(struct OrderStatisticsTreeLib.Tree self, uint256 targetFutureValue) internal view returns (uint256 droppedAmount)
```

### dropLeft

```solidity
function dropLeft(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 limitValue, uint256 limitFutureValue) internal returns (uint256 value, uint256 filledAmount, uint256 filledFutureValue, uint256 remainingAmount, struct PartiallyFilledOrder partiallyFilledOrder)
```

### dropRight

```solidity
function dropRight(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 limitValue, uint256 limitFutureValue) internal returns (uint256 value, uint256 filledAmount, uint256 filledFutureValue, uint256 remainingAmount, struct PartiallyFilledOrder partiallyFilledOrder)
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
function getOrderById(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (struct OrderItem)
```

_Retrieves the Object denoted by `_id`._

### orderIdExists

```solidity
function orderIdExists(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (bool)
```

_Return boolean if value, amount and orderId exist in doubly linked list_

### insertOrder

```solidity
function insertOrder(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId, address user, uint256 amount, bool isInterruption) internal
```

### removeOrder

```solidity
function removeOrder(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal returns (uint256 amount)
```

### fillOrders

```solidity
function fillOrders(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint256 _amount) internal returns (struct PartiallyFilledOrder partiallyFilledOrder)
```

_Reduces order amount once market order taken._

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

### _dropOrders

```solidity
function _dropOrders(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal returns (uint256 amount)
```

_Drop the OrderItems older than or equal `orderId` from the list_

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
function _link(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint48 _prevId, uint48 _nextId) internal
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

