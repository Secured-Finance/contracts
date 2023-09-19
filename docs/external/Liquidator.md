# Solidity API

## Liquidator

### nativeToken

```solidity
bytes32 nativeToken
```

### lendingMarketController

```solidity
contract ILendingMarketController lendingMarketController
```

### tokenVault

```solidity
contract ITokenVault tokenVault
```

### uniswapRouter

```solidity
contract ISwapRouter uniswapRouter
```

### uniswapQuoter

```solidity
contract IQuoter uniswapQuoter
```

### poolFee

```solidity
uint24 poolFee
```

### collateralMaturities

```solidity
uint256[] collateralMaturities
```

### constructor

```solidity
constructor(bytes32 _nativeToken, address _lendingMarketController, address _tokenVault, address _uniswapRouter, address _uniswapQuoter) public
```

### receive

```solidity
receive() external payable
```

### executeLiquidationCall

```solidity
function executeLiquidationCall(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, uint24 _poolFee) external
```

### executeForcedRepayment

```solidity
function executeForcedRepayment(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, uint24 _poolFee) external
```

### executeOperationForCollateral

```solidity
function executeOperationForCollateral(address _liquidator, address _user, bytes32 _collateralCcy, uint256 _receivedCollateralAmount) external returns (bool)
```

### executeOperationForDebt

```solidity
function executeOperationForDebt(address _liquidator, address _user, bytes32 _collateralCcy, uint256 _receivedCollateralAmount, bytes32 _debtCcy, uint256 _debtMaturity, uint256 _receivedDebtAmount) external returns (bool)
```

### deposit

```solidity
function deposit(bytes32 _ccy, uint256 _amount) external payable
```

_Deposits funds by the caller into the token vault._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### withdraw

```solidity
function withdraw(bytes32 _ccy, uint256 _amount) external
```

_Withdraws funds by the caller from the token vault._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### _executeSwap

```solidity
function _executeSwap(address _ccyFrom, address _ccyTo, uint256 _amountIn, uint256 _amountOutMinimum, uint24 _poolFee, bool _isNativeCurrency) internal returns (uint256)
```

