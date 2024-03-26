# Solidity API

## Liquidator

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
function executeLiquidationCall(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, address _uniswapRouter, uint24 _poolFee) external
```

Executes the liquidation call.

_In this liquidation call, Uniswap V2 is used for swapping when poolFee is 0.
Otherwise, Uniswap V3 is used._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _collateralCcy | bytes32 | Currency name of the collateral in bytes32 |
| _collateralMaturities | uint256[] | Maturities of the collateral |
| _debtCcy | bytes32 | Currency name of the debt in bytes32 |
| _debtMaturity | uint256 | Maturity of the debt |
| _user | address | Address of the user |
| _uniswapRouter | address | Address of the Uniswap router |
| _poolFee | uint24 | Pool fee |

### executeForcedRepayment

```solidity
function executeForcedRepayment(bytes32 _collateralCcy, uint256[] _collateralMaturities, bytes32 _debtCcy, uint256 _debtMaturity, address _user, address _uniswapRouter, uint24 _poolFee) external
```

Executes the forced repayment.

_In this liquidation call, Uniswap V2 is used for swapping when poolFee is 0.
Otherwise, Uniswap V3 is used._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _collateralCcy | bytes32 | Currency name of the collateral in bytes32 |
| _collateralMaturities | uint256[] | Maturities of the collateral |
| _debtCcy | bytes32 | Currency name of the debt in bytes32 |
| _debtMaturity | uint256 | Maturity of the debt |
| _user | address | Address of the user |
| _uniswapRouter | address | Address of the Uniswap router |
| _poolFee | uint24 | Pool fee |

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

### _executeSwapWithV3

```solidity
function _executeSwapWithV3(address _collateralCcy, address _debtCcy, uint256 _amountIn, uint24 _poolFee, bool _isNativeCurrency) internal
```

### _executeSwapWithV2

```solidity
function _executeSwapWithV2(address _collateralCcy, address _debtCcy, uint256 _amountIn, bool _isCollateralInNativeCurrency, bool _isDebtInNativeCurrency) internal
```

