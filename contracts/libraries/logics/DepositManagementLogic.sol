// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {CollateralParametersHandler as Params} from "../CollateralParametersHandler.sol";
import {ERC20Handler} from "../ERC20Handler.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {TokenVaultStorage as Storage} from "../../storages/TokenVaultStorage.sol";

library DepositManagementLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using RoundingUint256 for uint256;

    struct CalculatedFundVars {
        uint256 workingLendOrdersAmount;
        uint256 collateralAmount;
        uint256 lentAmount;
        uint256 workingBorrowOrdersAmount;
        uint256 debtAmount;
        uint256 borrowedAmount;
        bool isEnoughDeposit;
    }

    struct SwapDepositAmountsVars {
        uint256 userDepositAmount;
        uint256 depositAmount;
        uint256 amountOutWithFee;
        uint256 estimatedAmountOut;
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
                totalUsedCollateral * Params.liquidationThresholdRate());
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
        (
            uint256 workingLendOrdersAmount,
            ,
            ,
            uint256 lentAmount,
            ,
            ,
            uint256 borrowedAmount
        ) = AddressResolverLib.lendingMarketController().calculateFunds(_ccy, _user);

        return
            Storage.slot().depositAmounts[_user][_ccy] +
            borrowedAmount -
            lentAmount -
            workingLendOrdersAmount;
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
            totalUsedCollateral * Params.liquidationThresholdRate()
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - ((totalUsedCollateral) * marginCallThresholdRate).
            uint256 maxWithdraw = (totalCollateral *
                ProtocolTypes.PRICE_DIGIT -
                (totalUsedCollateral) *
                Params.liquidationThresholdRate()).div(ProtocolTypes.PRICE_DIGIT);
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
    function withdraw(
        address user,
        bytes32 _ccy,
        uint256 _amount
    ) public returns (uint256 withdrawableAmount) {
        uint256 depositAmount = Storage.slot().depositAmounts[user][_ccy];
        if (Storage.slot().collateralCurrencies.contains(_ccy)) {
            uint256 maxWithdrawETH = getWithdrawableCollateral(user);
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

        removeDepositAmount(user, _ccy, withdrawableAmount);

        return withdrawableAmount;
    }

    function getLiquidationAmount(
        address _user,
        bytes32 _liquidationCcy,
        uint256 _liquidationAmountMaximum
    )
        public
        view
        returns (
            uint256 liquidationAmount,
            uint256 protocolFee,
            uint256 liquidatorFee,
            uint256 insolventAmount
        )
    {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = getCollateralAmount(_user);
        uint256 liquidationAmountInETH = totalCollateral * ProtocolTypes.PCT_DIGIT >=
            totalUsedCollateral * Params.liquidationThresholdRate()
            ? 0
            : totalUsedCollateral / 2;
        liquidationAmount = AddressResolverLib.currencyController().convertFromETH(
            _liquidationCcy,
            liquidationAmountInETH
        );

        protocolFee =
            (liquidationAmount * Params.liquidationProtocolFeeRate()) /
            ProtocolTypes.PCT_DIGIT;
        liquidatorFee = (liquidationAmount * Params.liquidatorFeeRate()) / ProtocolTypes.PCT_DIGIT;
        uint256 liquidationTotalAmount = liquidationAmount + protocolFee + liquidatorFee;

        uint256 userDepositAmount = Storage.slot().depositAmounts[_user][_liquidationCcy];

        if (_liquidationAmountMaximum > userDepositAmount) {
            _liquidationAmountMaximum = userDepositAmount;
        }

        if (liquidationTotalAmount > userDepositAmount) {
            insolventAmount = liquidationTotalAmount - userDepositAmount;
        }

        if (liquidationTotalAmount > _liquidationAmountMaximum) {
            liquidationTotalAmount = _liquidationAmountMaximum;
            protocolFee =
                (liquidationTotalAmount * Params.liquidationProtocolFeeRate()) /
                (ProtocolTypes.PCT_DIGIT +
                    Params.liquidatorFeeRate() +
                    Params.liquidationProtocolFeeRate());
            liquidatorFee =
                (liquidationTotalAmount * Params.liquidatorFeeRate()) /
                (ProtocolTypes.PCT_DIGIT +
                    Params.liquidatorFeeRate() +
                    Params.liquidationProtocolFeeRate());
            liquidationAmount = liquidationTotalAmount - protocolFee - liquidatorFee;
        }
    }

    function transferFrom(
        bytes32 _ccy,
        address _sender,
        address _receiver,
        uint256 _amount
    ) external returns (uint256 amount) {
        uint256 senderDepositAmount = Storage.slot().depositAmounts[_sender][_ccy];

        amount = _amount;
        if (_amount > senderDepositAmount) {
            amount = senderDepositAmount;
        }

        removeDepositAmount(_sender, _ccy, amount);
        addDepositAmount(_receiver, _ccy, amount);
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
