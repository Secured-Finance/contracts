# Solidity API

## TokenVault

Implements the management of the token in each currency for users.

This contract manages the following data related to tokens.
- Deposited token amount as the collateral
- Parameters related to the liquidation
  - Liquidation threshold rate
  - Liquidation fee rate received by protocol
  - Liquidation fee rate received by liquidators

### onlyRegisteredCurrency

```solidity
modifier onlyRegisteredCurrency(bytes32 _ccy)
```

Modifier to check if currency hasn't been registered yet

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |

### ifActive

```solidity
modifier ifActive()
```

Modifier to check if the protocol is active.

### initialize

```solidity
function initialize(address _owner, address _resolver, uint256 _liquidationThresholdRate, uint256 _fullLiquidationThresholdRate, uint256 _liquidationProtocolFeeRate, uint256 _liquidatorFeeRate, address _nativeToken) public
```

Initializes the contract.

_Function is invoked by the proxy contract when the contract is added to the ProxyController._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the contract owner |
| _resolver | address | The address of the Address Resolver contract |
| _liquidationThresholdRate | uint256 | The liquidation threshold rate |
| _fullLiquidationThresholdRate | uint256 | The full liquidation threshold rate |
| _liquidationProtocolFeeRate | uint256 | The liquidation fee rate received by protocol |
| _liquidatorFeeRate | uint256 | The liquidation fee rate received by liquidators |
| _nativeToken | address | The address of wrapped token of native currency |

### requiredContracts

```solidity
function requiredContracts() public pure returns (bytes32[] contracts)
```

Returns the contract names used in this contract.

_The contract name list is in `./libraries/Contracts.sol`._

### receive

```solidity
receive() external payable
```

### isCovered

```solidity
function isCovered(address _user, bytes32 _orderCcy) public view returns (bool isEnoughCollateral, bool isEnoughDepositInOrderCcy)
```

Gets if the collateral is sufficient or not

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _orderCcy | bytes32 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| isEnoughCollateral | bool | The boolean if the user has enough collateral or not |
| isEnoughDepositInOrderCcy | bool | The boolean if the user has enough deposit in the order currency or not |

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

### getRevision

```solidity
function getRevision() external pure returns (uint256)
```

Gets the revision number of the contract

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The revision number |

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

Gets the maximum amount of the base currency that can be withdrawn from user collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Maximum amount of the base currency that can be withdrawn |

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
function getCoverage(address _user) external view returns (uint256)
```

Gets the rate of collateral used.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The rate of collateral used |

### getTotalUnusedCollateralAmount

```solidity
function getTotalUnusedCollateralAmount(address _user) external view returns (uint256)
```

Gets the total amount of the unused collateral in the base currency

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
| totalCollateralAmount | uint256 | The total collateral amount in the base currency |

### getCollateralDetail

```solidity
function getCollateralDetail(address _user) external view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalDeposit)
```

Gets the collateral detail.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalCollateral | uint256 | The total collateral amount in the base currency |
| totalUsedCollateral | uint256 | The total used collateral amount in the base currency |
| totalDeposit | uint256 | The total deposit amount in the base currency |

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

### getBorrowableAmount

```solidity
function getBorrowableAmount(address _user, bytes32 _ccy) external view returns (uint256)
```

Gets the borrowable amount in the selected currency.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | amount The borrowable amount |

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

### getLiquidationThresholdRate

```solidity
function getLiquidationThresholdRate() public view returns (uint256 rate)
```

Gets the liquidation threshold rate.

| Name | Type | Description |
| ---- | ---- | ----------- |
| rate | uint256 | The liquidation threshold rate |

### calculateCoverage

```solidity
function calculateCoverage(address _user, struct ILendingMarketController.AdditionalFunds _additionalFunds) external view returns (uint256 coverage, bool isInsufficientDepositAmount)
```

Calculates the collateral rate used when additional funds are had by the user.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _additionalFunds | struct ILendingMarketController.AdditionalFunds | Additional funds for calculating the coverage |

| Name | Type | Description |
| ---- | ---- | ----------- |
| coverage | uint256 | The rate of collateral used |
| isInsufficientDepositAmount | bool | The boolean if the lent amount in the selected currency is insufficient for the deposit amount or not |

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

### depositTo

```solidity
function depositTo(bytes32 _ccy, uint256 _amount, address _onBehalfOf) external payable
```

_Deposits funds by the caller into collateral._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |
| _onBehalfOf | address | The beneficiary of the supplied deposits |

### depositFrom

```solidity
function depositFrom(address _from, bytes32 _ccy, uint256 _amount) external payable
```

_Deposits funds by the `from` into collateral._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | Address of the user |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |

### depositWithPermitTo

```solidity
function depositWithPermitTo(bytes32 _ccy, uint256 _amount, address _onBehalfOf, uint256 _deadline, uint8 _permitV, bytes32 _permitR, bytes32 _permitS) external
```

_Deposits funds by the caller into collateral with transfer approval of asset via permit function_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |
| _onBehalfOf | address | The beneficiary of the supplied deposits |
| _deadline | uint256 | The deadline timestamp that the permit is valid |
| _permitV | uint8 | The V parameter of ERC712 permit sig |
| _permitR | bytes32 | The R parameter of ERC712 permit sig |
| _permitS | bytes32 | The S parameter of ERC712 permit sig |

### depositWithPermitFrom

```solidity
function depositWithPermitFrom(address _from, bytes32 _ccy, uint256 _amount, uint256 _deadline, uint8 _permitV, bytes32 _permitR, bytes32 _permitS) external
```

_Deposits funds by the `from` into collateral with transfer approval of asset via permit function_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | Address of the user |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to deposit |
| _deadline | uint256 | The deadline timestamp that the permit is valid |
| _permitV | uint8 | The V parameter of ERC712 permit sig |
| _permitR | bytes32 | The R parameter of ERC712 permit sig |
| _permitS | bytes32 | The S parameter of ERC712 permit sig |

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

### cleanUpUsedCurrencies

```solidity
function cleanUpUsedCurrencies(address _user, bytes32 _ccy) external
```

Clean up the used currencies of the user.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |
| _ccy | bytes32 | Currency name in bytes32 |

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

### pause

```solidity
function pause() external
```

Pauses the token vault.

### unpause

```solidity
function unpause() external
```

Unpauses the token vault.

### _deposit

```solidity
function _deposit(address _caller, bytes32 _ccy, uint256 _amount, address _onBehalfOf) internal
```

### _withdraw

```solidity
function _withdraw(address _user, bytes32 _ccy, uint256 _amount) internal
```

