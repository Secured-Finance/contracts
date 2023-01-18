// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {CollateralParametersHandler} from "../CollateralParametersHandler.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {TokenVaultStorage as Storage} from "../../storages/TokenVaultStorage.sol";

library DepositManagementLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    struct CalculatedFundVars {
        uint256 workingLendOrdersAmount;
        uint256 collateralAmount;
        uint256 lentAmount;
        uint256 workingBorrowOrdersAmount;
        uint256 debtAmount;
        uint256 borrowedAmount;
        bool isEnoughDeposit;
    }

    function isCovered(
        address _user,
        bytes32 _unsettledOrderCcy,
        uint256 _unsettledOrderAmount,
        bool _isUnsettledBorrowOrder
    ) public view returns (bool) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = getCollateralAmount(
            _user,
            _unsettledOrderCcy,
            _unsettledOrderAmount,
            _isUnsettledBorrowOrder
        );

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * ProtocolTypes.PCT_DIGIT >=
                totalUsedCollateral * CollateralParametersHandler.liquidationThresholdRate());
    }

    function getUsedCurrencies(address _user) public view returns (bytes32[] memory) {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        uint256 numCurrencies = currencySet.length();
        bytes32[] memory currencies = new bytes32[](numCurrencies);

        for (uint256 i = 0; i < numCurrencies; i++) {
            bytes32 currency = currencySet.at(i);
            currencies[i] = currency;
        }

        return currencies;
    }

    function getDepositAmount(address _user, bytes32 _ccy) public view returns (uint256) {
        (, , , uint256 lentAmount, , , uint256 borrowedAmount) = AddressResolverLib
            .lendingMarketController()
            .calculateFunds(_ccy, _user);
        return Storage.slot().depositAmounts[_user][_ccy] + borrowedAmount - lentAmount;
    }

    function getCollateralAmount(address _user)
        public
        view
        returns (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalActualCollateral
        )
    {
        return getCollateralAmount(_user, "", 0, false);
    }

    function getCollateralAmount(
        address _user,
        bytes32 _unsettledOrderCcy,
        uint256 _unsettledOrderAmount,
        bool _isUnsettledBorrowOrder
    )
        public
        view
        returns (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalActualCollateral
        )
    {
        CalculatedFundVars memory vars;

        uint256 depositAmount = Storage.slot().depositAmounts[_user][_unsettledOrderCcy];
        uint256 unsettledBorrowOrdersAmountInETH;

        if (_unsettledOrderAmount > 0) {
            if (_isUnsettledBorrowOrder) {
                unsettledBorrowOrdersAmountInETH = AddressResolverLib
                    .currencyController()
                    .convertToETH(_unsettledOrderCcy, _unsettledOrderAmount);
            } else {
                require(
                    depositAmount >= _unsettledOrderAmount,
                    "Not enough collateral in the selected currency"
                );
                depositAmount -= _unsettledOrderAmount;

                if (Storage.slot().collateralCurrencies.contains(_unsettledOrderCcy)) {
                    vars.workingLendOrdersAmount += AddressResolverLib
                        .currencyController()
                        .convertToETH(_unsettledOrderCcy, _unsettledOrderAmount);
                }
            }
        }

        (
            vars.workingLendOrdersAmount,
            ,
            vars.collateralAmount,
            vars.lentAmount,
            vars.workingBorrowOrdersAmount,
            vars.debtAmount,
            vars.borrowedAmount,
            vars.isEnoughDeposit
        ) = AddressResolverLib.lendingMarketController().calculateTotalFundsInETH(
            _user,
            _unsettledOrderCcy,
            depositAmount
        );

        require(
            vars.isEnoughDeposit || _isUnsettledBorrowOrder || _unsettledOrderAmount == 0,
            "Not enough collateral in the selected currency"
        );

        uint256 totalInternalDepositAmount = _getTotalInternalDepositAmountInETH(_user);

        uint256 actualPlusCollateral = totalInternalDepositAmount + vars.borrowedAmount;
        uint256 minusCollateral = vars.workingLendOrdersAmount + vars.lentAmount;
        uint256 plusCollateral = actualPlusCollateral + vars.collateralAmount;

        totalCollateral = plusCollateral >= minusCollateral ? plusCollateral - minusCollateral : 0;
        totalUsedCollateral =
            vars.workingBorrowOrdersAmount +
            vars.debtAmount +
            unsettledBorrowOrdersAmountInETH;
        totalActualCollateral = actualPlusCollateral >= minusCollateral
            ? actualPlusCollateral - minusCollateral
            : 0;
    }

    /**
     * @notice Calculates maximum amount of ETH that can be withdrawn.
     * @param _user User's address
     * @return Maximum amount of ETH that can be withdrawn
     */
    function getWithdrawableCollateral(address _user) public view returns (uint256) {
        (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalActualCollateral
        ) = getCollateralAmount(_user);

        if (totalUsedCollateral == 0) {
            return totalActualCollateral;
        } else if (
            totalCollateral * ProtocolTypes.PRICE_DIGIT >
            totalUsedCollateral * CollateralParametersHandler.liquidationThresholdRate()
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - ((totalUsedCollateral) * marginCallThresholdRate).
            uint256 maxWithdraw = (totalCollateral *
                ProtocolTypes.PRICE_DIGIT -
                (totalUsedCollateral) *
                CollateralParametersHandler.liquidationThresholdRate()) / ProtocolTypes.PRICE_DIGIT;
            return maxWithdraw >= totalActualCollateral ? totalActualCollateral : maxWithdraw;
        } else {
            return 0;
        }
    }

    function addDepositAmount(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) public {
        Storage.slot().depositAmounts[_user][_ccy] += _amount;
        Storage.slot().totalDepositAmount[_ccy] += _amount;

        _updateUsedCurrencies(_user, _ccy);
    }

    function removeDepositAmount(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) public {
        require(
            Storage.slot().depositAmounts[_user][_ccy] >= _amount,
            "Not enough collateral in the selected currency"
        );

        Storage.slot().depositAmounts[_user][_ccy] -= _amount;
        Storage.slot().totalDepositAmount[_ccy] -= _amount;

        _updateUsedCurrencies(_user, _ccy);
    }

    /**
     * @notice Withdraws funds by the caller from unused collateral.
     * @param _ccy Currency name in bytes32
     * @param _amount Amount of funds to withdraw.
     */
    function withdraw(bytes32 _ccy, uint256 _amount) public returns (uint256 withdrawableAmount) {
        uint256 depositAmount = Storage.slot().depositAmounts[msg.sender][_ccy];
        if (Storage.slot().collateralCurrencies.contains(_ccy)) {
            uint256 maxWithdrawETH = getWithdrawableCollateral(msg.sender);
            uint256 maxWithdraw = AddressResolverLib.currencyController().convertFromETH(
                _ccy,
                maxWithdrawETH
            );

            withdrawableAmount = _amount > maxWithdraw ? maxWithdraw : _amount;
            withdrawableAmount = depositAmount >= withdrawableAmount
                ? withdrawableAmount
                : depositAmount;
        } else {
            withdrawableAmount = depositAmount;
        }

        removeDepositAmount(msg.sender, _ccy, withdrawableAmount);

        return withdrawableAmount;
    }

    /**
     * @notice Gets the total of amount deposited in the user's collateral of all currencies
     *  in this contract by converting it to ETH.
     * @param _user Address of collateral user
     * @return totalDepositAmount The total deposited amount in ETH
     */
    function _getTotalInternalDepositAmountInETH(address _user)
        internal
        view
        returns (uint256 totalDepositAmount)
    {
        EnumerableSet.Bytes32Set storage currencies = Storage.slot().usedCurrencies[_user];
        uint256 len = currencies.length();

        for (uint256 i = 0; i < len; i++) {
            bytes32 ccy = currencies.at(i);
            if (Storage.slot().collateralCurrencies.contains(ccy)) {
                uint256 depositAmount = Storage.slot().depositAmounts[_user][ccy];
                totalDepositAmount += AddressResolverLib.currencyController().convertToETH(
                    ccy,
                    depositAmount
                );
            }
        }

        return totalDepositAmount;
    }

    function _updateUsedCurrencies(address _user, bytes32 _ccy) internal {
        if (Storage.slot().depositAmounts[_user][_ccy] > 0) {
            Storage.slot().usedCurrencies[_user].add(_ccy);
        } else {
            Storage.slot().usedCurrencies[_user].remove(_ccy);
        }
    }
}
