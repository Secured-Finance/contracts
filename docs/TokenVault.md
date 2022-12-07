# Solidity API

## TokenVault

Implements the management of the token in each currency for users.

This contract manages the following data related to tokens.
- Deposited token amount as the collateral
- Parameters related to the collateral
  - Margin Call Threshold Rate
  - Auto Liquidation Threshold Rate
  - Liquidation Price Rate
  - Min Collateral Rate

To address a currency as collateral, it must be registered using `registerCurrency` method in this contract.

### CalculatedFundVars

```solidity
struct CalculatedFundVars {
  uint256 workingLendOrdersAmount;
  uint256 collateralAmount;
  uint256 lentAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 debtAmount;
  uint256 borrowedAmount;
}
```

### onlyRegisteredCurrency

```solidity
modifier onlyRegisteredCurrency(bytes32 _ccy)
```

Modifier to check if currency hasn't been registered yet

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### initialize

```solidity
function initialize(address _owner, address _resolver, uint256 _liquidationThresholdRate, address _uniswapRouter, address _WETH9) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _liquidationThresholdRate | uint256 | The rate used as the auto liquidation threshold |
| _uniswapRouter | address | Uniswap router contract address |
| _WETH9 | address | The address of WETH |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### acceptedContracts

```solidity
function acceptedContracts() public pure returns (bytes32[] contracts)
```

Returns contract names that can call this contract.

_The contact name listed in this method is also needed to be listed `requiredContracts` method._

### receive

```solidity
receive() external payable
```

### isCovered

```solidity
function isCovered(address _user, bytes32 _unsettledOrderCcy, uint256 _unsettledOrderAmount, enum ProtocolTypes.Side _unsettledOrderSide) external view returns (bool)
```

Gets if the collateral has enough coverage.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _unsettledOrderCcy | bytes32 | Additional unsettled order currency name in bytes32 |
| _unsettledOrderAmount | uint256 | Additional unsettled order amount |
| _unsettledOrderSide | enum ProtocolTypes.Side |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the collateral has sufficient coverage or not |

### isCovered

```solidity
function isCovered(address _user) public view returns (bool)
```

Gets if the collateral has enough coverage.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the collateral has sufficient coverage or not |

### isRegisteredCurrency

```solidity
function isRegisteredCurrency(bytes32 _ccy) public view returns (bool)
```

Gets if the currency has been registered

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the currency has been registered or not |

### getTokenAddress

```solidity
function getTokenAddress(bytes32 _ccy) public view returns (address)
```

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(address _user) external view virtual returns (uint256)
```

Gets the maximum amount of ETH that can be withdrawn from user collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Maximum amount of ETH that can be withdrawn |

### getCoverage

```solidity
function getCoverage(address _user) public view returns (uint256)
```

Gets the rate of collateral used.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The rate of collateral used |

### getUnusedCollateral

```solidity
function getUnusedCollateral(address _user) external view returns (uint256)
```

Gets the total amount of unused collateral

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total amount of unused collateral |

### getTotalCollateralAmount

```solidity
function getTotalCollateralAmount(address _user) public view returns (uint256 totalCollateralAmount)
```

Gets the total collateral amount.
by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of collateral user |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalCollateralAmount | uint256 | The total collateral amount in ETH |

### getLiquidationAmount

```solidity
function getLiquidationAmount(address _user) external view returns (uint256)
```

### getDepositAmount

```solidity
function getDepositAmount(address _user, bytes32 _ccy) external view returns (uint256)
```

Gets the amount deposited in the user's collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The deposited amount |

### getUsedCurrencies

```solidity
function getUsedCurrencies(address _user) public view returns (bytes32[])
```

Gets the currencies that the user used as collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | The currency names in bytes32 |

### getLiquidationThresholdRate

```solidity
function getLiquidationThresholdRate() external view returns (uint256 liquidationThresholdRate)
```

Gets liquidation threshold rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidationThresholdRate | uint256 | The rate used as the liquidation threshold |

### getUniswapRouter

```solidity
function getUniswapRouter() external view returns (address uniswapRouter)
```

Gets liquidation threshold rate

| Name | Type | Description |
| ---- | ---- | ----------- |
| uniswapRouter | address | Uniswap router contract address |

### registerCurrency

```solidity
function registerCurrency(bytes32 _ccy, address _tokenAddress) external
```

### deposit

```solidity
function deposit(bytes32 _ccy, uint256 _amount) external payable
```

_Deposits funds by the caller into collateral._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### depositFrom

```solidity
function depositFrom(address _from, bytes32 _ccy, uint256 _amount) external payable
```

_Deposits funds by the `from` into collateral._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | user's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### withdraw

```solidity
function withdraw(bytes32 _ccy, uint256 _amount) external
```

Withdraws funds by the caller from unused collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to withdraw. |

### addCollateral

```solidity
function addCollateral(address _user, bytes32 _ccy, uint256 _amount) external
```

_Adds collateral amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### removeCollateral

```solidity
function removeCollateral(address _user, bytes32 _ccy, uint256 _amount) external
```

Removes collateral amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to withdraw. |

### swapCollateral

```solidity
function swapCollateral(address _user, bytes32 _ccyIn, bytes32 _ccyOut, uint256 _amountInMax, uint256 _amountOut, uint24 _poolFee) external returns (uint256 amountIn)
```

Swap the collateral to convert to a different currency using Uniswap.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccyIn | bytes32 | Currency name to be converted from |
| _ccyOut | bytes32 | Currency name to be converted to |
| _amountInMax | uint256 | The maximum amount to be converted from |
| _amountOut | uint256 | Amount to be converted to |
| _poolFee | uint24 | Uniswap pool fee |

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _liquidationThresholdRate, address _uniswapRouter) external
```

Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning.

Triggers only be contract owner

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| _uniswapRouter | address | Uniswap router contract address |

### _isCovered

```solidity
function _isCovered(address _user, bytes32 _unsettledOrderCcy, uint256 _unsettledOrderAmount, bool _isUnsettledBorrowOrder) internal view returns (bool)
```

Gets if the collateral has enough coverage.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _unsettledOrderCcy | bytes32 | Additional unsettled order currency name in bytes32 |
| _unsettledOrderAmount | uint256 | Additional unsettled order amount |
| _isUnsettledBorrowOrder | bool |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the collateral has enough coverage or not |

### _getCoverage

```solidity
function _getCoverage(address _user) internal view returns (uint256 coverage)
```

Gets the collateral coverage.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| coverage | uint256 | The rate of collateral used |

### _getActualCollateralAmount

```solidity
function _getActualCollateralAmount(address _user, bytes32 _unsettledOrderCcy, uint256 _unsettledOrderAmount, bool _isUnsettledBorrowOrder) private view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalActualCollateral)
```

### _getWithdrawableCollateral

```solidity
function _getWithdrawableCollateral(address _user) internal view returns (uint256)
```

Calculates maximum amount of ETH that can be withdrawn.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Maximum amount of ETH that can be withdrawn |

### _getTotalInternalCollateralAmountInETH

```solidity
function _getTotalInternalCollateralAmountInETH(address _user) internal view returns (uint256 totalCollateral)
```

Gets the total of amount deposited in the user's collateral of all currencies
 in this contract by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of collateral user |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalCollateral | uint256 | The total deposited amount in ETH |

### _updateUsedCurrencies

```solidity
function _updateUsedCurrencies(address _user, bytes32 _ccy) internal
```

### _deposit

```solidity
function _deposit(address _user, bytes32 _ccy, uint256 _amount) internal
```

