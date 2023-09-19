# Solidity API

## LendingMarketUserLogic

### InvalidAmount

```solidity
error InvalidAmount()
```

### FutureValueIsZero

```solidity
error FutureValueIsZero()
```

### TooManyActiveOrders

```solidity
error TooManyActiveOrders()
```

### NotEnoughCollateral

```solidity
error NotEnoughCollateral()
```

### getOrderEstimation

```solidity
function getOrderEstimation(struct ILendingMarketController.GetOrderEstimationParams input) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount, uint256 coverage, bool isInsufficientDepositAmount)
```

### executeOrder

```solidity
function executeOrder(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external
```

### executePreOrder

```solidity
function executePreOrder(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) external
```

### unwindPosition

```solidity
function unwindPosition(bytes32 _ccy, uint256 _maturity, address _user) external
```

### updateFundsForTaker

```solidity
function updateFundsForTaker(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledAmount, uint256 _filledAmountInFV, uint256 _filledUnitPrice, uint256 _feeInFV) public
```

### updateFundsForMaker

```solidity
function updateFundsForMaker(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, struct PartiallyFilledOrder partiallyFilledOrder) public
```

### _calculateFilledAmount

```solidity
function _calculateFilledAmount(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) internal view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount)
```

### _estimateCollateralCoverage

```solidity
function _estimateCollateralCoverage(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _unitPrice, uint256 _additionalDepositAmount, bool _ignoreBorrowedAmount, uint256 _filledAmount, uint256 _filledAmountInFV, uint256 _orderFeeInFV, uint256 _placedAmount) internal view returns (uint256 coverage, bool isInsufficientDepositAmount)
```

### _estimatePVFromFV

```solidity
function _estimatePVFromFV(bytes32 _ccy, uint256 _maturity, uint256 _amount, uint256 _unitPrice) internal view returns (uint256)
```

### _unwindPosition

```solidity
function _unwindPosition(bytes32 _ccy, uint256 _maturity, address _user, int256 _futureValue) internal returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV, enum ProtocolTypes.Side side)
```

