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
function initialize(address _owner, address _resolver, uint256 _liquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate, address _uniswapRouter, address _uniswapQuoter, address _WETH9) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _liquidationThresholdRate | uint256 | The rate used as the auto liquidation threshold |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |
| _uniswapRouter | address | Uniswap router contract address |
| _uniswapQuoter | address | Uniswap quoter contract address |
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

### isCollateral

```solidity
function isCollateral(bytes32 _ccy) public view returns (bool)
```

Gets if the currency is acceptable as collateral

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | The boolean if the currency has been registered or not |

### isCollateral

```solidity
function isCollateral(bytes32[] _ccys) external view returns (bool[] isCollateralCurrencies)
```

Gets if the currencies are acceptable as collateral

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccys | bytes32[] | Currency name list in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| isCollateralCurrencies | bool[] | Array of the boolean if the currency has been registered or not |

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

Gets the token contract address

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | The token contract address |

### getCollateralCurrencies

```solidity
function getCollateralCurrencies() external view returns (bytes32[])
```

Gets the currencies accepted as collateral

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | Array of the currency accepted as collateral |

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(address _user) external view returns (uint256)
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
function getCoverage(address _user) external view returns (uint256 coverage)
```

Gets the rate of collateral used.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| coverage | uint256 | The rate of collateral used |

### getUnusedCollateral

```solidity
function getUnusedCollateral(address _user) external view returns (uint256)
```

Gets the total amount of the unused collateral

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

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalCollateralAmount | uint256 | The total collateral amount in ETH |

### getLiquidationAmount

```solidity
function getLiquidationAmount(address _user) external view returns (uint256 liquidationAmount)
```

Gets the amount to be liquidated.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidationAmount | uint256 | The the amount to be liquidated |

### getTotalDepositAmount

```solidity
function getTotalDepositAmount(bytes32 _ccy) external view returns (uint256)
```

Gets the total amount deposited of the selected currency

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The total deposited amount |

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

### getCollateralParameters

```solidity
function getCollateralParameters() external view returns (uint256 liquidationThresholdRate, uint256 liquidationProtocolFeeRate, uint256 liquidatorFeeRate, address uniswapRouter, address uniswapQuoter)
```

Gets the collateral parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| liquidationProtocolFeeRate | uint256 | Liquidation fee rate received by protocol |
| liquidatorFeeRate | uint256 | Liquidation fee rate received by liquidators |
| uniswapRouter | address | Uniswap router contract address |
| uniswapQuoter | address | Uniswap quoter contract address |

### registerCurrency

```solidity
function registerCurrency(bytes32 _ccy, address _tokenAddress, bool _isCollateral) external
```

Registers new currency and sets if it is acceptable as collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _tokenAddress | address | Token contract address of the selected currency |
| _isCollateral | bool | Boolean if the selected currency is acceptable as collateral. |

### updateCurrency

```solidity
function updateCurrency(bytes32 _ccy, bool _isCollateral) external
```

Updates the currency if it is acceptable as collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _isCollateral | bool | Boolean if the selected currency is acceptable as collateral. |

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

### addDepositAmount

```solidity
function addDepositAmount(address _user, bytes32 _ccy, uint256 _amount) external
```

_Adds deposit amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### removeDepositAmount

```solidity
function removeDepositAmount(address _user, bytes32 _ccy, uint256 _amount) external
```

Removes deposit amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to withdraw. |

### swapDepositAmounts

```solidity
function swapDepositAmounts(address _liquidator, address _user, bytes32 _ccyFrom, bytes32 _ccyTo, uint256 _amountOut, uint24 _poolFee) external returns (uint256 amountOut)
```

Swap the deposited amount to convert to a different currency using Uniswap for liquidation.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidator | address | Liquidator's address |
| _user | address | User's address |
| _ccyFrom | bytes32 | Currency name to be converted from |
| _ccyTo | bytes32 | Currency name to be converted to |
| _amountOut | uint256 | Amount to be converted to |
| _poolFee | uint24 | Uniswap pool fee |

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _liquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate, address _uniswapRouter, address _uniswapQuoter) external
```

Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning.

Triggers only be contract owner

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | The auto liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |
| _uniswapRouter | address | Uniswap router contract address |
| _uniswapQuoter | address | Uniswap quoter contract address |

### _deposit

```solidity
function _deposit(address _user, bytes32 _ccy, uint256 _amount) internal
```

### _withdraw

```solidity
function _withdraw(address _user, bytes32 _ccy, uint256 _amount) internal
```

