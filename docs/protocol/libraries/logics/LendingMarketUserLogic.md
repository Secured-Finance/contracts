# Solidity API

## LendingMarketUserLogic

### createOrder

```solidity
function createOrder(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external
```

### createPreOrder

```solidity
function createPreOrder(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external
```

### unwindPosition

```solidity
function unwindPosition(bytes32 _ccy, uint256 _maturity, address _user) external
```

### updateFundsForTaker

```solidity
function updateFundsForTaker(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledAmount, uint256 _filledAmountInFV, uint256 _filledUnitPrice) public
```

### updateFundsForMaker

```solidity
function updateFundsForMaker(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder) public
```

### getOrders

```solidity
function getOrders(bytes32[] _ccys, address _user) external view returns (struct ILendingMarketController.Order[] activeOrders, struct ILendingMarketController.Order[] inactiveOrders)
```

### _getOrdersPerCurrency

```solidity
function _getOrdersPerCurrency(bytes32 _ccy, address _user) internal view returns (struct ILendingMarketController.Order[] activeOrders, struct ILendingMarketController.Order[] inactiveOrders)
```

### _getOrdersPerMarket

```solidity
function _getOrdersPerMarket(bytes32 _ccy, uint256 _maturity, address _user) internal view returns (struct ILendingMarketController.Order[] activeOrders, struct ILendingMarketController.Order[] inactiveOrders)
```

### _getOrder

```solidity
function _getOrder(bytes32 _ccy, contract ILendingMarket _market, uint48 _orderId) internal view returns (struct ILendingMarketController.Order order)
```

### _flattenOrders

```solidity
function _flattenOrders(struct ILendingMarketController.Order[][] orders, uint256 totalLength) internal pure returns (struct ILendingMarketController.Order[] flattened)
```

### _unwindPosition

```solidity
function _unwindPosition(bytes32 _ccy, uint256 _maturity, address _user, int256 _futureValue) internal returns (struct ILendingMarket.FilledOrder filledOrder, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder, enum ProtocolTypes.Side side)
```

