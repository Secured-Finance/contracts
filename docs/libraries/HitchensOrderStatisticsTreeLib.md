# Solidity API

## UnfilledOrder

```solidity
struct UnfilledOrder {
  uint48 orderId;
  address maker;
  uint256 amount;
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

## HitchensOrderStatisticsTreeLib

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
  mapping(uint256 => struct OrderItem) orders;
}
```

### Tree

```solidity
struct Tree {
  uint256 root;
  mapping(uint256 => struct HitchensOrderStatisticsTreeLib.Node) nodes;
}
```

### first

```solidity
function first(struct HitchensOrderStatisticsTreeLib.Tree self) internal view returns (uint256 _value)
```

### last

```solidity
function last(struct HitchensOrderStatisticsTreeLib.Tree self) internal view returns (uint256 _value)
```

### next

```solidity
function next(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 _cursor)
```

### prev

```solidity
function prev(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 _cursor)
```

### exists

```solidity
function exists(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (bool _exists)
```

### amountExistsInNode

```solidity
function amountExistsInNode(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 amount, uint256 value) internal view returns (bool)
```

### orderExistsInNode

```solidity
function orderExistsInNode(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (bool)
```

### getNode

```solidity
function getNode(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256, uint256, uint256, bool, uint256, uint256, uint256)
```

### getNodeCount

```solidity
function getNodeCount(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256)
```

### count

```solidity
function count(struct HitchensOrderStatisticsTreeLib.Tree self) internal view returns (uint256 _count)
```

### insert

```solidity
function insert(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal
```

### remove

```solidity
function remove(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) internal
```

### treeMinimum

```solidity
function treeMinimum(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256)
```

### treeMaximum

```solidity
function treeMaximum(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256)
```

### rotateLeft

```solidity
function rotateLeft(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) private
```

### rotateRight

```solidity
function rotateRight(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) private
```

### insertFixup

```solidity
function insertFixup(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) private
```

### replaceParent

```solidity
function replaceParent(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 a, uint256 b) private
```

### removeFixup

```solidity
function removeFixup(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value) private
```

### getOrderById

```solidity
function getOrderById(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (struct OrderItem)
```

_Retrieves the Object denoted by `_id`._

### isOrderIdExists

```solidity
function isOrderIdExists(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal view returns (bool)
```

_Return boolean if value, amount and orderId exist in doubly linked list_

### isAmountExistsInList

```solidity
function isAmountExistsInList(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint256 amount) internal view returns (bool)
```

_Return boolean if value and amount exist in doubly linked list._

### findOrderIdForAmount

```solidity
function findOrderIdForAmount(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint256 amount) internal view returns (uint256)
```

_Return the id of the first OrderItem matching `_amount` in the amount field._

### insertOrder

```solidity
function insertOrder(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId, address user, uint256 amount, bool isInterruption) internal
```

### removeOrder

```solidity
function removeOrder(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal returns (uint256 amount)
```

### fillOrders

```solidity
function fillOrders(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint256 _amount) internal returns (uint48[] orderIds, address[] makers, uint256[] amounts, uint256 remainingAmount, struct UnfilledOrder unfilledOrder)
```

_Reduces order amount once market order taken._

### upSizeOrder

```solidity
function upSizeOrder(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId, uint256 _amount) internal returns (bool)
```

_Up size order by market maker._

### addHead

```solidity
function addHead(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 _value, uint48 _orderId, address _user, uint256 _amount) internal
```

_Insert a new OrderItem as the new Head with `_amount` in the amount field, and orderId._

### addTail

```solidity
function addTail(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 _value, uint48 _orderId, address _user, uint256 _amount) internal
```

_Insert a new OrderItem as the new Tail with `_amount` in the amount field, and orderId._

### _removeOrder

```solidity
function _removeOrder(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal returns (uint256 amount)
```

_Remove the OrderItem denoted by `_id` from the List._

### _setHead

```solidity
function _setHead(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal
```

_Internal function to update the Head pointer._

### _setTail

```solidity
function _setTail(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId) internal
```

_Internal function to update the Tail pointer._

### _createOrder

```solidity
function _createOrder(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 orderId, address user, uint256 amount) internal returns (uint48)
```

_Internal function to create an unlinked Order._

### _link

```solidity
function _link(struct HitchensOrderStatisticsTreeLib.Tree self, uint256 value, uint48 _prevId, uint48 _nextId) internal
```

_Internal function to link an Object to another._

