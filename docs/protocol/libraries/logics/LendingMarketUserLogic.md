# Solidity API

## LendingMarketUserLogic

### unwind

```solidity
function unwind(bytes32 _ccy, uint256 _maturity, address _user, int256 _futureValue) external returns (uint256 filledUnitPrice, uint256 filledAmount, uint256 filledFutureValue, struct ILendingMarket.PartiallyFilledOrder partiallyFilledOrder, enum ProtocolTypes.Side side)
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

