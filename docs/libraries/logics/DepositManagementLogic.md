# Solidity API

## DepositManagementLogic

### CalculatedFundVars

```solidity
struct CalculatedFundVars {
  uint256 workingLendOrdersAmount;
  uint256 collateralAmount;
  uint256 lentAmount;
  uint256 workingBorrowOrdersAmount;
  uint256 debtAmount;
  uint256 borrowedAmount;
  bool isEnoughDeposit;
}
```

### isCovered

```solidity
function isCovered(address _user, bytes32 _unsettledOrderCcy, uint256 _unsettledOrderAmount, bool _isUnsettledBorrowOrder) public view returns (bool)
```

### getUsedCurrencies

```solidity
function getUsedCurrencies(address _user) public view returns (bytes32[])
```

### getDepositAmount

```solidity
function getDepositAmount(address _user, bytes32 _ccy) public view returns (uint256)
```

### getCollateralAmount

```solidity
function getCollateralAmount(address _user) public view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalActualCollateral)
```

### getCollateralAmount

```solidity
function getCollateralAmount(address _user, bytes32 _unsettledOrderCcy, uint256 _unsettledOrderAmount, bool _isUnsettledBorrowOrder) public view returns (uint256 totalCollateral, uint256 totalUsedCollateral, uint256 totalActualCollateral)
```

### getWithdrawableCollateral

```solidity
function getWithdrawableCollateral(address _user) public view returns (uint256)
```

Calculates maximum amount of ETH that can be withdrawn.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | User's address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Maximum amount of ETH that can be withdrawn |

### addDepositAmount

```solidity
function addDepositAmount(address _user, bytes32 _ccy, uint256 _amount) public
```

### removeDepositAmount

```solidity
function removeDepositAmount(address _user, bytes32 _ccy, uint256 _amount) public
```

### withdraw

```solidity
function withdraw(address user, bytes32 _ccy, uint256 _amount) public returns (uint256 withdrawableAmount)
```

Withdraws funds by the caller from unused collateral.

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address |  |
| _ccy | bytes32 | Currency name in bytes32 |
| _amount | uint256 | Amount of funds to withdraw. |

### _getTotalInternalDepositAmountInETH

```solidity
function _getTotalInternalDepositAmountInETH(address _user) internal view returns (uint256 totalDepositAmount)
```

Gets the total of amount deposited in the user's collateral of all currencies
 in this contract by converting it to ETH.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of collateral user |

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalDepositAmount | uint256 | The total deposited amount in ETH |

### _updateUsedCurrencies

```solidity
function _updateUsedCurrencies(address _user, bytes32 _ccy) internal
```

