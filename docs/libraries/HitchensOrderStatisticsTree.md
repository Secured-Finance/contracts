# Solidity API

## HitchensOrderStatisticsTree

### tree

```solidity
struct HitchensOrderStatisticsTreeLib.Tree tree
```

### InsertOrder

```solidity
event InsertOrder(string action, uint256 amount, uint256 value, uint256 orderId)
```

### RemoveOrder

```solidity
event RemoveOrder(string action, uint256 amount, uint256 value, uint256 _id)
```

### constructor

```solidity
constructor() public
```

### treeRootNode

```solidity
function treeRootNode() public view returns (uint256 _value)
```

### firstValue

```solidity
function firstValue() public view returns (uint256 _value)
```

### lastValue

```solidity
function lastValue() public view returns (uint256 _value)
```

### nextValue

```solidity
function nextValue(uint256 value) public view returns (uint256 _value)
```

### prevValue

```solidity
function prevValue(uint256 value) public view returns (uint256 _value)
```

### valueExists

```solidity
function valueExists(uint256 value) public view returns (bool _exists)
```

### amountValueExists

```solidity
function amountValueExists(uint256 amount, uint256 value) public view returns (bool _exists)
```

### getNode

```solidity
function getNode(uint256 value) public view returns (uint256 _parent, uint256 _left, uint256 _right, bool _red, uint256 _head, uint256 _tail, uint256 _orderCounter)
```

### getOrderByID

```solidity
function getOrderByID(uint256 value, uint256 id) public view returns (uint256 _orderId, uint256 _next, uint256 _prev, uint256 _timestamp, uint256 _amount)
```

### getRootCount

```solidity
function getRootCount() public view returns (uint256 _orderCounter)
```

### getValueCount

```solidity
function getValueCount(uint256 value) public view returns (uint256 _orderCounter)
```

### insertAmountValue

```solidity
function insertAmountValue(uint256 amount, uint256 value, uint256 orderId) public
```

### removeAmountValue

```solidity
function removeAmountValue(uint256 amount, uint256 value, uint256 orderId) public
```

