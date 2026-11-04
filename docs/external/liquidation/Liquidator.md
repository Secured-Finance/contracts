# Solidity API

## Liquidator

### InvalidConversionAdapter

```solidity
error InvalidConversionAdapter(address adapter)
```

### InvalidConversionPair

```solidity
error InvalidConversionPair(address tokenIn, address tokenOut)
```

### InvalidSwapExecutor

```solidity
error InvalidSwapExecutor(address executor)
```

### InvalidSwapPair

```solidity
error InvalidSwapPair(address tokenIn, address tokenOut)
```

### InsufficientOutputAmount

```solidity
error InsufficientOutputAmount(uint256 minimumAmountOut, uint256 actualAmountOut)
```

### ConversionAdapterUpdated

```solidity
event ConversionAdapterUpdated(address tokenIn, address previousAdapter, address newAdapter)
```

### TokenConverted

```solidity
event TokenConverted(address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)
```

### SwapExecutorUpdated

```solidity
event SwapExecutorUpdated(address tokenIn, address tokenOut, address previousExecutor, address newExecutor)
```

### TokenSwapped

```solidity
event TokenSwapped(address executor, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)
```

### nativeToken

```solidity
address nativeToken
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
address uniswapRouter
```

### poolFee

```solidity
uint24 poolFee
```

### collateralMaturities

```solidity
uint256[] collateralMaturities
```

### minimumAmountOut

```solidity
uint256 minimumAmountOut
```

### conversionAdapters

```solidity
mapping(address => address) conversionAdapters
```

### swapExecutors

```solidity
mapping(address => mapping(address => address)) swapExecutors
```

### onlyLendingMarketController

```solidity
modifier onlyLendingMarketController()
```

### constructor

```solidity
constructor(bytes32 _nativeToken, address _lendingMarketController, address _tokenVault) public
```

### initialize

```solidity
function initialize() public
```

### receive

```solidity
receive() external payable
```

### executeLiquidationCall

```solidity
function executeLiquidationCall(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, address _uniswapRouter, uint24 _poolFee, uint256 _minimumAmountOut) external
```

Executes the liquidation call.

_A registered pair-aware swap executor is preferred. If none is registered,
     Uniswap V2 is used when poolFee is 0 and Uniswap V3 otherwise._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _collateralCcy | bytes32 | Currency name of the collateral in bytes32 |
| _collateralMaturities | uint256[] | Maturities of the collateral |
| _debtCcy | bytes32 | Currency name of the debt in bytes32 |
| _debtMaturity | uint256 | Maturity of the debt |
| _user | address | Address of the user |
| _uniswapRouter | address | Address of the Uniswap router |
| _poolFee | uint24 | Pool fee |
| _minimumAmountOut | uint256 | Minimum debt currency amount to receive from the conversion route, or zero if unset |

### executeForcedRepayment

```solidity
function executeForcedRepayment(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, address _uniswapRouter, uint24 _poolFee, uint256 _minimumAmountOut) external
```

Executes the forced repayment.

_A registered pair-aware swap executor is preferred. If none is registered,
     Uniswap V2 is used when poolFee is 0 and Uniswap V3 otherwise._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _collateralCcy | bytes32 | Currency name of the collateral in bytes32 |
| _collateralMaturities | uint256[] | Maturities of the collateral |
| _debtCcy | bytes32 | Currency name of the debt in bytes32 |
| _debtMaturity | uint256 | Maturity of the debt |
| _user | address | Address of the user |
| _uniswapRouter | address | Address of the Uniswap router |
| _poolFee | uint24 | Pool fee |
| _minimumAmountOut | uint256 | Minimum debt currency amount to receive from the conversion route, or zero if unset |

### executeOperationForCollateral

```solidity
function executeOperationForCollateral(address _liquidator, address _user, bytes32 _collateralCcy, uint256 _receivedCollateralAmount) external returns (bool)
```

Executes the operation for collateral as a callback from the lending market controller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidator | address | Address of the liquidator |
| _user | address | Address of the user |
| _collateralCcy | bytes32 | Currency name of the collateral in bytes32 |
| _receivedCollateralAmount | uint256 | Amount of the received collateral |

### executeOperationForDebt

```solidity
function executeOperationForDebt(address _liquidator, address _user, bytes32 _collateralCcy, uint256 _receivedCollateralAmount, bytes32 _debtCcy, uint256 _debtMaturity, uint256 _receivedDebtAmount) external returns (bool)
```

Executes the operation for debt as a callback from the lending market controller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidator | address | Address of the liquidator |
| _user | address | Address of the user |
| _collateralCcy | bytes32 | Currency name of the collateral in bytes32 |
| _receivedCollateralAmount | uint256 | Amount of the received collateral |
| _debtCcy | bytes32 | Currency name of the debt in bytes32 |
| _debtMaturity | uint256 | Maturity of the debt |
| _receivedDebtAmount | uint256 | Amount of the received debt |

### deposit

```solidity
function deposit(bytes32 _ccy, uint256 _amount) external payable
```

Deposits funds by the caller into the token vault.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### withdraw

```solidity
function withdraw(bytes32 _ccy, uint256 _amount) external
```

Withdraws funds by the caller from the token vault.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### setConversionAdapter

```solidity
function setConversionAdapter(address _tokenIn, address _adapter) external
```

Sets the conversion adapter used for an input token.

_Setting the adapter to the zero address removes the current adapter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokenIn | address | Address of the token to register the adapter for |
| _adapter | address | Address of the conversion adapter, or zero to remove it |

### setSwapExecutor

```solidity
function setSwapExecutor(address _tokenIn, address _tokenOut, address _executor) external
```

Sets the swap executor used for a token pair.

_Setting the executor to the zero address removes the current executor._

### _executeConversion

```solidity
function _executeConversion(address _adapter, address _tokenIn, uint256 _amountIn) internal returns (address tokenOut, uint256 amountOut)
```

### _executeSwapWithExecutor

```solidity
function _executeSwapWithExecutor(address _executor, address _tokenIn, address _tokenOut, uint256 _amountIn, bool _isInputNative, bool _isOutputNative) internal returns (uint256 amountOut)
```

### _executeSwapWithV3

```solidity
function _executeSwapWithV3(address _collateralCcy, address _debtCcy, uint256 _amountIn, uint24 _poolFee, bool _isNativeCurrency) internal
```

### _executeSwapWithV2

```solidity
function _executeSwapWithV2(address _collateralCcy, address _debtCcy, uint256 _amountIn, bool _isCollateralInNativeCurrency, bool _isDebtInNativeCurrency) internal
```

