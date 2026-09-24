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

### ORDER_CHUNK_SIZE

```solidity
uint16 ORDER_CHUNK_SIZE
```

### MAX_ACTIVE_CHUNKS_PER_PRICE

```solidity
uint32 MAX_ACTIVE_CHUNKS_PER_PRICE
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

### OrderChunk

```solidity
struct OrderChunk {
  uint256 totalAmount;
  uint48 firstOrderId;
  uint32 prevChunkId;
  uint32 nextChunkId;
  uint16 orderCount;
}
```

### PriceChunkMetadata

```solidity
struct PriceChunkMetadata {
  uint32 firstChunkId;
  uint32 lastChunkId;
  uint32 lastAllocatedChunkId;
  uint48 explicitMappingStartOrderId;
  uint32 activeChunkCount;
  mapping(uint32 => struct OrderStatisticsTreeLib.OrderChunk) chunks;
  mapping(uint48 => uint32) orderChunkIds;
}
```

### Tree

```solidity
struct Tree {
  uint256 root;
  mapping(uint256 => struct OrderStatisticsTreeLib.Node) nodes;
  mapping(uint256 => struct OrderStatisticsTreeLib.PriceChunkMetadata) chunkMetadata;
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

### nextWithTotalAmount

```solidity
function nextWithTotalAmount(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 cursor, uint256 totalAmount)
```

### prevWithTotalAmount

```solidity
function prevWithTotalAmount(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal view returns (uint256 cursor, uint256 totalAmount)
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
function removeFixup(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint256 parent, bool valueIsLeftChild) private
```

### _leftOf

```solidity
function _leftOf(struct OrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256)
```

### _rightOf

```solidity
function _rightOf(struct OrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256)
```

### _isRed

```solidity
function _isRed(struct OrderStatisticsTreeLib.Tree self, uint256 value) private view returns (bool)
```

### _setRedIfNotEmpty

```solidity
function _setRedIfNotEmpty(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### _setBlackIfNotEmpty

```solidity
function _setBlackIfNotEmpty(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### calculateDroppedAmountFromLeft

```solidity
function calculateDroppedAmountFromLeft(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal view returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV)
```

### calculateDroppedAmountFromRight

```solidity
function calculateDroppedAmountFromRight(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal view returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV)
```

### DropVars

```solidity
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
```

### dropLeft

```solidity
function dropLeft(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV, uint256 remainingAmount, struct PartiallyRemovedOrder partiallyRemovedOrder)
```

### dropRight

```solidity
function dropRight(struct OrderStatisticsTreeLib.Tree self, uint256 amount, uint256 amountInFV, uint256 limitValue) internal returns (uint256 droppedValue, uint256 droppedAmount, uint256 droppedAmountInFV, uint256 remainingAmount, struct PartiallyRemovedOrder partiallyRemovedOrder)
```

### _hasBlackDeficitFromLeft

```solidity
function _hasBlackDeficitFromLeft(struct OrderStatisticsTreeLib.Tree self, uint256 target) private view returns (bool)
```

### _hasBlackDeficitFromRight

```solidity
function _hasBlackDeficitFromRight(struct OrderStatisticsTreeLib.Tree self, uint256 target) private view returns (bool)
```

### _rebalanceBlackHeights

```solidity
function _rebalanceBlackHeights(struct OrderStatisticsTreeLib.Tree self, uint256 target, uint256 stopParent) private returns (uint256 processedUntil)
```

### _fixBlackDeficit

```solidity
function _fixBlackDeficit(struct OrderStatisticsTreeLib.Tree self, uint256 target, uint256 leftBlackHeight, uint256 rightBlackHeight) private returns (uint256 nextTarget, uint256 newLeftBlackHeight, uint256 newRightBlackHeight, bool targetChangedByFix)
```

### _childBlackHeights

```solidity
function _childBlackHeights(struct OrderStatisticsTreeLib.Tree self, uint256 target) private view returns (uint256 leftBlackHeight, uint256 rightBlackHeight)
```

### _absDiff

```solidity
function _absDiff(uint256 a, uint256 b) private pure returns (uint256)
```

### _blackHeight

```solidity
function _blackHeight(struct OrderStatisticsTreeLib.Tree self, uint256 value) private view returns (uint256 height)
```

### _fixBlackDeficitFromLeft

```solidity
function _fixBlackDeficitFromLeft(struct OrderStatisticsTreeLib.Tree self, uint256 target) private returns (uint256 nextTarget)
```

### _fixBlackDeficitFromRight

```solidity
function _fixBlackDeficitFromRight(struct OrderStatisticsTreeLib.Tree self, uint256 target) private returns (uint256 nextTarget)
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

_Return boolean if value, amount and orderId exist in doubly linked list
Order IDs must increase monotonically because prefix removals leave old orders in storage
and use the current head order ID to distinguish them from active orders._

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
function removeOrders(struct OrderStatisticsTreeLib.Tree self, uint256 value, uint256 amount) internal returns (struct PartiallyRemovedOrder partiallyRemovedOrder)
```

### migrateOrderChunks

```solidity
function migrateOrderChunks(struct OrderStatisticsTreeLib.Tree self, uint256 value) internal
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

### _ensureChunkMetadata

```solidity
function _ensureChunkMetadata(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### _migrateChunkMetadata

```solidity
function _migrateChunkMetadata(struct OrderStatisticsTreeLib.Tree self, uint256 value) private
```

### _addOrderToChunk

```solidity
function _addOrderToChunk(struct OrderStatisticsTreeLib.PriceChunkMetadata metadata, uint48 orderId, uint256 amount) private
```

### _getActiveOrderChunkId

```solidity
function _getActiveOrderChunkId(struct OrderStatisticsTreeLib.PriceChunkMetadata metadata, uint48 orderId) private view returns (uint32 chunkId)
```

_Orders created before explicitMappingStartOrderId belong to the first chunk.
This lookup relies on order IDs increasing monotonically._

### _removeOrderFromChunk

```solidity
function _removeOrderFromChunk(struct OrderStatisticsTreeLib.PriceChunkMetadata metadata, uint48 orderId, uint256 amount, uint48 nextOrderId) private
```

### _removeOrdersFromBoundaryChunk

```solidity
function _removeOrdersFromBoundaryChunk(struct OrderStatisticsTreeLib.Node gn, struct OrderStatisticsTreeLib.OrderChunk chunk, uint256 amount) private returns (uint256 removedAmount, uint256 removedCount, uint48 partiallyRemovedOrderId, uint256 partiallyRemovedAmount, uint256 remainingAmount)
```

### _unlinkChunkPrefix

```solidity
function _unlinkChunkPrefix(struct OrderStatisticsTreeLib.PriceChunkMetadata metadata, uint32 firstRemainingChunkId, uint32 removedChunkCount) private
```

### _unlinkChunk

```solidity
function _unlinkChunk(struct OrderStatisticsTreeLib.PriceChunkMetadata metadata, uint32 chunkId) private
```

### _calculateFutureValue

```solidity
function _calculateFutureValue(uint256 unitPrice, uint256 amount) internal pure returns (uint256)
```

### _calculatePresentValue

```solidity
function _calculatePresentValue(uint256 unitPrice, uint256 amount) internal pure returns (uint256)
```

