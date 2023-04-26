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
function executeLiquidationCall(bytes32 _collateralCcy, bytes32 _debtCcy, uint256 _debtMaturity, address _user, uint24 _poolFee) external
```

### executeOperation

```solidity
function executeOperation(address liquidator, address user, bytes32 collateralCcy, uint256 receivedCollateralAmount, bytes32 debtCcy, uint256 debtMaturity, uint256 receivedDebtAmount, address initiator) external returns (bool)
```

### _executeSwap

```solidity
function _executeSwap(address _ccyFrom, address _ccyTo, uint256 _amountIn, uint256 _amountOutMinimum, uint24 _poolFee) internal returns (uint256)
```

