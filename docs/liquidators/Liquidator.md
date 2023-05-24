# Solidity API

## Liquidator

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
constructor(address _lendingMarketController, address _tokenVault, address _uniswapRouter, address _uniswapQuoter) public
```

### receive

```solidity
receive() external payable
```

### executeLiquidationCall

```solidity
function executeLiquidationCall(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, uint24 _poolFee) external
```

### executeOperationForCollateral

```solidity
function executeOperationForCollateral(address _liquidator, address _user, bytes32 _collateralCcy, uint256 _receivedCollateralAmount) external returns (bool)
```

### executeOperationForDebt

```solidity
function executeOperationForDebt(address _liquidator, address _user, bytes32 _collateralCcy, uint256 _receivedCollateralAmount, bytes32 _debtCcy, uint256 _debtMaturity, uint256 _receivedDebtAmount) external returns (bool)
```

### _executeSwap

```solidity
function _executeSwap(address _ccyFrom, address _ccyTo, uint256 _amountIn, uint256 _amountOutMinimum, uint24 _poolFee, bool _isETH) internal returns (uint256)
```

