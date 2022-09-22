# Solidity API

## TokenVault

Implements the management of the token in each currency for users.

This contract manages the following data related to tokens.
- Deposited token amount as the collateral
- Unsettled collateral amount used by order
- Escrowed token amount added by lending orders
- Parameters related to the collateral
  - Margin Call Threshold Rate
  - Auto Liquidation Threshold Rate
  - Liquidation Price Rate
  - Min Collateral Rate

To address a currency as collateral, it must be registered using `registerCurrency` method in this contract.

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
function initialize(address _owner, address _resolver, uint256 _marginCallThresholdRate, uint256 _autoLiquidationThresholdRate, uint256 _liquidationPriceRate, uint256 _minCollateralRate, address _WETH9) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _marginCallThresholdRate | uint256 | The rate used as the margin call threshold |
| _autoLiquidationThresholdRate | uint256 | The rate used as the auto liquidation threshold |
| _liquidationPriceRate | uint256 | The rate used as the liquidation price |
| _minCollateralRate | uint256 | The rate used minima collateral |
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

### getUnsettledCollateral

```solidity
function getUnsettledCollateral(address _user, bytes32 _ccy) external view returns (uint256)
```

Gets unsettled exposure for the selected currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Unsettled exposure |

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

### getTotalUnsettledExposure

```solidity
function getTotalUnsettledExposure(address _user) external view returns (uint256)
```

Gets total unsettled exposure in all currencies.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total unsettled exposure |

### getCollateralAmount

```solidity
function getCollateralAmount(address _user, bytes32 _ccy) public view returns (uint256)
```

Gets the amount deposited in the user's collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The deposited amount |

### getCollateralAmountInETH

```solidity
function getCollateralAmountInETH(address _user, bytes32 _ccy) public view returns (uint256)
```

Gets the amount deposited in the user's collateral by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Specified currency |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The deposited amount in ETH |

### getTotalCollateralAmountInETH

```solidity
function getTotalCollateralAmountInETH(address _user) public view returns (uint256)
```

Gets the total amount deposited in the user's collateral in all currencies.
by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of collateral user |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total deposited amount in ETH |

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

### getCollateralParameters

```solidity
function getCollateralParameters() external view returns (uint256 marginCallThresholdRate, uint256 autoLiquidationThresholdRate, uint256 liquidationPriceRate, uint256 minCollateralRate)
```

Gets parameters related to collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| marginCallThresholdRate | uint256 | The rate used as the margin call threshold |
| autoLiquidationThresholdRate | uint256 | The rate used as the auto liquidation threshold |
| liquidationPriceRate | uint256 | The rate used as the liquidation price |
| minCollateralRate | uint256 | The rate used minima collateral |

### useUnsettledCollateral

```solidity
function useUnsettledCollateral(address _user, bytes32 _ccy, uint256 _amount) external
```

Locks unsettled collateral for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to be locked in a specified currency |

### releaseUnsettledCollateral

```solidity
function releaseUnsettledCollateral(address _user, address _sender, bytes32 _ccy, uint256 _amount) external
```

Releases the amount of unsettled exposure for the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _sender | address | Address of user sending token |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to be unlocked from unsettled exposure in a specified currency |

### registerCurrency

```solidity
function registerCurrency(bytes32 _ccy, address _tokenAddress) external
```

### deposit

```solidity
function deposit(bytes32 _ccy, uint256 _amount) public payable
```

_Deposits funds by the caller into collateral._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### withdraw

```solidity
function withdraw(bytes32 _ccy, uint256 _amount) public
```

Withdraws funds by the caller from unused collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to withdraw. |

### addEscrowedAmount

```solidity
function addEscrowedAmount(address _payer, bytes32 _ccy, uint256 _amount) external payable
```

Add funds to escrow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payer | address | Address of user making payment |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to be add into escrow |

### removeEscrowedAmount

```solidity
function removeEscrowedAmount(address _payer, address _receiver, bytes32 _ccy, uint256 _amount) external
```

Remove funds from escrow.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payer | address | Address of user making payment |
| _receiver | address | Address of user receiving payment |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to be removed from escrow |

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _marginCallThresholdRate, uint256 _autoLiquidationThresholdRate, uint256 _liquidationPriceRate, uint256 _minCollateralRate) external
```

Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning.

Triggers only be contract owner

| Name | Type | Description |
| ---- | ---- | ----------- |
| _marginCallThresholdRate | uint256 | Margin call threshold ratio |
| _autoLiquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| _liquidationPriceRate | uint256 | Liquidation price rate |
| _minCollateralRate | uint256 | Minimal collateral rate |

### _isCovered

```solidity
function _isCovered(address _user, bytes32 _ccy, uint256 _unsettledExp) internal view returns (bool)
```

Gets if the collateral has enough coverage.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _unsettledExp | uint256 | Additional exposure to lock into unsettled exposure |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the collateral has enough coverage or not |

### _getCoverage

```solidity
function _getCoverage(address _user, bytes32 _ccy, uint256 _unsettledExp) internal view returns (uint256 coverage)
```

Gets the collateral coverage.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _unsettledExp | uint256 | Additional exposure to lock into unsettled exposure |

| Name | Type | Description |
| ---- | ---- | ----------- |
| coverage | uint256 | The rate of collateral used |

### _getTotalUnsettledExposure

```solidity
function _getTotalUnsettledExposure(address _user, bytes32 _ccy, uint256 _unsettledExp) internal view returns (uint256 totalExp)
```

Gets total unsettled exposure in all currencies.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's ethereum address |
| _ccy | bytes32 | Currency name in bytes32 |
| _unsettledExp | uint256 | Additional exposure to lock into unsettled exposure |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalExp | uint256 | The total collateral amount |

### _getUsedCollateral

```solidity
function _getUsedCollateral(address _user) internal view returns (uint256)
```

Gets the total collateral used in all currencies.
The collateral used is defined as the negative future value in the lending market contract.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total amount of used collateral |

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

### _updateUsedCurrencies

```solidity
function _updateUsedCurrencies(bytes32 _ccy) internal
```

