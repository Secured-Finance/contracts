# Solidity API

## LendingMarketUserLogic

### InvalidAmount

```solidity
error InvalidAmount()
```

### AmountIsZero

```solidity
error AmountIsZero()
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

### NotEnoughDeposit

```solidity
error NotEnoughDeposit(bytes32 ccy)
```

### EstimateCollateralCoverageParams

```solidity
struct EstimateCollateralCoverageParams {
  bytes32 ccy;
  uint256 maturity;
  address user;
  enum ProtocolTypes.Side side;
  uint256 unitPrice;
  uint256 additionalDepositAmount;
  bool ignoreBorrowedAmount;
  uint256 filledAmount;
  uint256 filledAmountInFV;
  uint256 orderFeeInFV;
  uint256 placedAmount;
}
```

### getOrderEstimation

```solidity
function getOrderEstimation(struct ILendingMarketController.GetOrderEstimationParams input) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount, uint256 coverage, bool isInsufficientDepositAmount)
```

### getOrderEstimationFromFV

```solidity
function getOrderEstimationFromFV(struct ILendingMarketController.GetOrderEstimationFromFVParams input) external view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 coverage, bool isInsufficientDepositAmount)
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
function unwindPosition(bytes32 _ccy, uint256 _maturity, address _user, uint256 _maxAmountInFV) external returns (uint256 filledAmount, uint256 filledAmountInFV, uint256 feeInFV)
```

### updateFundsForTaker

```solidity
function updateFundsForTaker(bytes32 _ccy, uint256 _maturity, address _user, enum ProtocolTypes.Side _side, uint256 _filledAmount, uint256 _filledAmountInFV, uint256 _feeInFV) public
```

### updateFundsForMaker

```solidity
function updateFundsForMaker(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, struct PartiallyFilledOrder partiallyFilledOrder) public
```

### withdrawZCToken

```solidity
function withdrawZCToken(bytes32 _ccy, uint256 _maturity, address _user, uint256 _amount) public
```

### depositZCToken

```solidity
function depositZCToken(bytes32 _ccy, uint256 _maturity, address _user, uint256 _amount) public
```

### getWithdrawableZCTokenAmount

```solidity
function getWithdrawableZCTokenAmount(bytes32 _ccy, uint256 _maturity, address _user) public view returns (uint256 amount)
```

### _calculateFilledAmount

```solidity
function _calculateFilledAmount(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amount, uint256 _unitPrice) internal view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV, uint256 placedAmount)
```

### _calculateFilledAmountFromFV

```solidity
function _calculateFilledAmountFromFV(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side _side, uint256 _amountInFV) internal view returns (uint256 lastUnitPrice, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV)
```

### _estimateCollateralCoverage

```solidity
function _estimateCollateralCoverage(struct LendingMarketUserLogic.EstimateCollateralCoverageParams _params) internal view returns (uint256 coverage, bool isInsufficientDepositAmount)
```

### _estimateFilledAmountWithFee

```solidity
function _estimateFilledAmountWithFee(bytes32 _ccy, uint256 _maturity, enum ProtocolTypes.Side side, uint256 filledAmount, uint256 filledAmountInFV, uint256 orderFeeInFV) internal view returns (uint256)
```

### _unwindPosition

```solidity
function _unwindPosition(bytes32 _ccy, uint256 _maturity, address _user, int256 _futureValue) internal returns (struct FilledOrder filledOrder, struct PartiallyFilledOrder partiallyFilledOrder, uint256 feeInFV, enum ProtocolTypes.Side side)
```

### _withdrawZCToken

```solidity
function _withdrawZCToken(bytes32 _ccy, uint256 _maturity, address _user, uint256 _amount) internal
```

### _depositZCToken

```solidity
function _depositZCToken(bytes32 _ccy, uint256 _maturity, address _user, uint256 _amount) internal
```

### _withdrawZCPerpetualToken

```solidity
function _withdrawZCPerpetualToken(bytes32 _ccy, address _user, uint256 _amount) internal
```

### _depositZCPerpetualToken

```solidity
function _depositZCPerpetualToken(bytes32 _ccy, address _user, uint256 _amount) internal
```

### _getWithdrawableZCTokenAmount

```solidity
function _getWithdrawableZCTokenAmount(bytes32 _ccy, uint256 _maturity, address _user) internal view returns (uint256 amount)
```

### _getWithdrawableZCPerpetualTokenAmount

```solidity
function _getWithdrawableZCPerpetualTokenAmount(bytes32 _ccy, address _user) internal view returns (uint256 amount)
```

### _getWithdrawableAmount

```solidity
function _getWithdrawableAmount(bytes32 _ccy, address _user) internal view returns (uint256 withdrawableAmount, bool hasAllocatedCollateral)
```

### _isCovered

```solidity
function _isCovered(address _user, bytes32 _ccy) internal view
```

