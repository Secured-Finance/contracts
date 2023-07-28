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
function initialize(address _owner, address _resolver, uint256 _liquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate, address _WETH9) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |
| _WETH9 | address | The address of the wrapped token to use as base currency |

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

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(bytes32 _ccy, address _user) external view returns (uint256)
```

Gets the maximum amount of the selected currency that can be withdrawn from user collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Maximum amount of the selected currency that can be withdrawn |

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
function getTotalCollateralAmount(address _user) external view returns (uint256 totalCollateralAmount)
```

Gets the total collateral amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalCollateralAmount | uint256 | The total collateral amount in ETH |

### getCollateralAmount

```solidity
function getCollateralAmount(address _user, bytes32 _ccy) external view returns (uint256 amount)
```

Gets the total collateral amount of the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The collateral amount |

### getLiquidationAmount

```solidity
function getLiquidationAmount(address _user, bytes32 _liquidationCcy, uint256 _liquidationAmountMaximum) external view returns (uint256 liquidationAmount, uint256 protocolFee, uint256 liquidatorFee)
```

Gets the amount to be liquidated.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _liquidationCcy | bytes32 |  |
| _liquidationAmountMaximum | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidationAmount | uint256 | The the amount to be liquidated |
| protocolFee | uint256 |  |
| liquidatorFee | uint256 |  |

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

### calculateCoverage

```solidity
function calculateCoverage(address _user, bytes32 _orderCcy, uint256 _orderAmount, enum ProtocolTypes.Side _orderSide) external view returns (uint256 coverage)
```

Calculates the rate of collateral used.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _orderCcy | bytes32 | Currency name in bytes32 of an order to be added |
| _orderAmount | uint256 | Amount of an order to be added |
| _orderSide | enum ProtocolTypes.Side | Order position type of an order to be added |

| Name | Type | Description |
| ---- | ---- | ----------- |
| coverage | uint256 | The rate of collateral used |

### calculateLiquidationFees

```solidity
function calculateLiquidationFees(uint256 _amount) external view returns (uint256 protocolFee, uint256 liquidatorFee)
```

Gets the actual fee amounts calculated by rates.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | Liquidation amount |

| Name | Type | Description |
| ---- | ---- | ----------- |
| protocolFee | uint256 | Liquidation fee amount received by protocol |
| liquidatorFee | uint256 | Liquidation fee amount received by liquidators |

### getCollateralParameters

```solidity
function getCollateralParameters() external view returns (uint256 liquidationThresholdRate, uint256 liquidationProtocolFeeRate, uint256 liquidatorFeeRate)
```

Gets the collateral parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidationThresholdRate | uint256 | Auto liquidation threshold rate |
| liquidationProtocolFeeRate | uint256 | Liquidation fee rate received by protocol |
| liquidatorFeeRate | uint256 | Liquidation fee rate received by liquidators |

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

### executeForcedReset

```solidity
function executeForcedReset(address _user, bytes32 _ccy) external returns (uint256)
```

Forces a reset of the user's deposit amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

### transferFrom

```solidity
function transferFrom(bytes32 _ccy, address _from, address _to, uint256 _amount) external returns (uint256 untransferredAmount)
```

Transfers the token from sender to receiver.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _from | address | Sender's address |
| _to | address | Receiver's address |
| _amount | uint256 | Amount of funds to sent |

### setCollateralParameters

```solidity
function setCollateralParameters(uint256 _liquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate) external
```

Sets main collateral parameters this function
solves the issue of frontrunning during parameters tuning.

Triggers only be contract owner

| Name | Type | Description |
| ---- | ---- | ----------- |
| _liquidationThresholdRate | uint256 | The auto liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |

### pauseVault

```solidity
function pauseVault() external
```

Pauses the token vault.

### unpauseVault

```solidity
function unpauseVault() external
```

Unpauses the token vault.

### _deposit

```solidity
function _deposit(address _user, bytes32 _ccy, uint256 _amount) internal
```

### _withdraw

```solidity
function _withdraw(address _user, bytes32 _ccy, uint256 _amount) internal
```

