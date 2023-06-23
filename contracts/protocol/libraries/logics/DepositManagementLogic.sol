// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "../../../dependencies/openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {CollateralParametersHandler as Params} from "../CollateralParametersHandler.sol";
import {ERC20Handler} from "../ERC20Handler.sol";
import {Constants} from "../Constants.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
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

    function isCovered(
        address _user,
        bytes32 _unsettledOrderCcy,
        uint256 _unsettledOrderAmount,
        bool _isUnsettledBorrowOrder
    ) public view returns (bool) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = calculateCollateral(
            _user,
            _unsettledOrderCcy,
            _unsettledOrderAmount,
            _isUnsettledBorrowOrder
        );

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * Constants.PCT_DIGIT >=
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
            uint256 totalDeposit
        )
    {
        return calculateCollateral(_user, "", 0, false);
    }

    function getCollateralAmount(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalDeposit
        )
    {
        (
            uint256 workingLendOrdersAmount,
            ,
            uint256 collateralAmount,
            uint256 lentAmount,
            uint256 workingBorrowOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        ) = AddressResolverLib.lendingMarketController().calculateFunds(_ccy, _user);

        uint256 plusDeposit = Storage.slot().depositAmounts[_user][_ccy] + borrowedAmount;
        uint256 minusDeposit = workingLendOrdersAmount + lentAmount;
        uint256 plusCollateral = plusDeposit + collateralAmount;

        totalCollateral = plusCollateral >= minusDeposit ? plusCollateral - minusDeposit : 0;
        totalUsedCollateral = workingBorrowOrdersAmount + debtAmount;
        totalDeposit = plusDeposit >= minusDeposit ? plusDeposit - minusDeposit : 0;
    }

    function calculateCollateral(
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
            uint256 totalDeposit
        )
    {
        CalculatedFundVars memory vars;

        uint256 depositAmount = Storage.slot().depositAmounts[_user][_unsettledOrderCcy];
        uint256 unsettledBorrowOrdersAmountInBaseCurrency;

        if (_unsettledOrderAmount > 0) {
            if (_isUnsettledBorrowOrder) {
                unsettledBorrowOrdersAmountInBaseCurrency = AddressResolverLib
                    .currencyController()
                    .convertToBaseCurrency(_unsettledOrderCcy, _unsettledOrderAmount);
            } else {
                require(
                    depositAmount >= _unsettledOrderAmount,
                    "Not enough collateral in the selected currency"
                );
                depositAmount -= _unsettledOrderAmount;

                if (Storage.slot().collateralCurrencies.contains(_unsettledOrderCcy)) {
                    vars.workingLendOrdersAmount += AddressResolverLib
                        .currencyController()
                        .convertToBaseCurrency(_unsettledOrderCcy, _unsettledOrderAmount);
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
        ) = AddressResolverLib.lendingMarketController().calculateTotalFundsInBaseCurrency(
            _user,
            _unsettledOrderCcy,
            depositAmount
        );

        require(
            vars.isEnoughDeposit || _isUnsettledBorrowOrder || _unsettledOrderAmount == 0,
            "Not enough collateral in the selected currency"
        );

        uint256 totalInternalDepositAmount = _getTotalInternalDepositAmountInBaseCurrency(_user);

        uint256 plusDeposit = totalInternalDepositAmount + vars.borrowedAmount;
        uint256 minusDeposit = vars.workingLendOrdersAmount + vars.lentAmount;
        uint256 plusCollateral = plusDeposit + vars.collateralAmount;

        totalCollateral = plusCollateral >= minusDeposit ? plusCollateral - minusDeposit : 0;
        totalUsedCollateral =
            vars.workingBorrowOrdersAmount +
            vars.debtAmount +
            unsettledBorrowOrdersAmountInBaseCurrency;
        totalDeposit = plusDeposit >= minusDeposit ? plusDeposit - minusDeposit : 0;
    }

    function getWithdrawableCollateral(address _user) public view returns (uint256) {
        (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalDeposit
        ) = getCollateralAmount(_user);

        if (totalUsedCollateral == 0) {
            return totalDeposit;
        } else if (
            totalCollateral * Constants.PRICE_DIGIT >
            totalUsedCollateral * Params.liquidationThresholdRate()
        ) {
            // NOTE: The formula is:
            // maxWithdraw = totalCollateral - ((totalUsedCollateral) * marginCallThresholdRate).
            uint256 maxWithdraw = (totalCollateral *
                Constants.PRICE_DIGIT -
                (totalUsedCollateral) *
                Params.liquidationThresholdRate()).div(Constants.PRICE_DIGIT);
            return maxWithdraw >= totalDeposit ? totalDeposit : maxWithdraw;
        } else {
            return 0;
        }
    }

    function getWithdrawableCollateral(bytes32 _ccy, address _user)
        public
        view
        returns (uint256 withdrawableAmount)
    {
        uint256 depositAmount = Storage.slot().depositAmounts[_user][_ccy];
        if (Storage.slot().collateralCurrencies.contains(_ccy)) {
            uint256 maxWithdrawETH = getWithdrawableCollateral(_user);
            uint256 maxWithdraw = AddressResolverLib.currencyController().convertFromBaseCurrency(
                _ccy,
                maxWithdrawETH
            );

            withdrawableAmount = depositAmount >= maxWithdraw ? maxWithdraw : depositAmount;
        } else {
            withdrawableAmount = getDepositAmount(_user, _ccy);
        }
    }

    function addDepositAmount(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) public {
        Storage.slot().depositAmounts[_user][_ccy] += _amount;
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
        _updateUsedCurrencies(_user, _ccy);
    }

    function executeForcedReset(address _user, bytes32 _ccy)
        external
        returns (uint256 removedAmount)
    {
        removedAmount = Storage.slot().depositAmounts[_user][_ccy];
        Storage.slot().depositAmounts[_user][_ccy] = 0;

        Storage.slot().usedCurrencies[_user].remove(_ccy);
    }

    function deposit(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) public {
        ERC20Handler.depositAssets(
            Storage.slot().tokenAddresses[_ccy],
            _user,
            address(this),
            _amount
        );

        addDepositAmount(_user, _ccy, _amount);
        Storage.slot().totalDepositAmount[_ccy] += _amount;
    }

    function withdraw(
        address _user,
        bytes32 _ccy,
        uint256 _amount
    ) public returns (uint256 withdrawableAmount) {
        withdrawableAmount = getWithdrawableCollateral(_ccy, _user);
        withdrawableAmount = _amount > withdrawableAmount ? withdrawableAmount : _amount;

        require(
            Storage.slot().totalDepositAmount[_ccy] >= withdrawableAmount,
            "Protocol is insolvent"
        );

        Storage.slot().totalDepositAmount[_ccy] -= withdrawableAmount;
        removeDepositAmount(_user, _ccy, withdrawableAmount);

        ERC20Handler.withdrawAssets(Storage.slot().tokenAddresses[_ccy], _user, withdrawableAmount);

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
            uint256 liquidatorFee
        )
    {
        (
            uint256 totalCollateralInBaseCcy,
            uint256 totalUsedCollateralInBaseCcy,

        ) = getCollateralAmount(_user);

        (uint256 collateralAmount, , ) = getCollateralAmount(_liquidationCcy, _user);

        require(collateralAmount != 0, "Not enough collateral in the selected currency");

        uint256 liquidationAmountInBaseCcy = totalCollateralInBaseCcy * Constants.PCT_DIGIT >=
            totalUsedCollateralInBaseCcy * Params.liquidationThresholdRate()
            ? 0
            : totalUsedCollateralInBaseCcy.div(2);

        uint256[] memory amountsInBaseCcy = new uint256[](2);
        amountsInBaseCcy[0] = liquidationAmountInBaseCcy;
        amountsInBaseCcy[1] = totalCollateralInBaseCcy;

        uint256[] memory amounts = AddressResolverLib.currencyController().convertFromBaseCurrency(
            _liquidationCcy,
            amountsInBaseCcy
        );

        liquidationAmount = amounts[0];
        uint256 totalCollateralAmount = amounts[1];

        if (liquidationAmount > _liquidationAmountMaximum) {
            liquidationAmount = _liquidationAmountMaximum;
        }

        (protocolFee, liquidatorFee) = calculateLiquidationFees(liquidationAmount);

        uint256 liquidationTotalAmount = liquidationAmount + protocolFee + liquidatorFee;

        // NOTE: If `totalCollateralAmount > collateralAmount` is true, it means that a user has collateral in other currencies
        // In this case, this liquidation is not covered by the reserve fund.
        // Therefore, we need to keep the total liquidation amount within the maximum amount.
        if (liquidationTotalAmount > collateralAmount && totalCollateralAmount > collateralAmount) {
            liquidationTotalAmount = collateralAmount;
            protocolFee = (liquidationTotalAmount * Params.liquidationProtocolFeeRate()).div(
                Constants.PCT_DIGIT +
                    Params.liquidatorFeeRate() +
                    Params.liquidationProtocolFeeRate()
            );
            liquidatorFee = (liquidationTotalAmount * Params.liquidatorFeeRate()).div(
                Constants.PCT_DIGIT +
                    Params.liquidatorFeeRate() +
                    Params.liquidationProtocolFeeRate()
            );
            liquidationAmount = liquidationTotalAmount - protocolFee - liquidatorFee;
        }
    }

    function calculateLiquidationFees(uint256 _amount)
        public
        view
        returns (uint256 protocolFee, uint256 liquidatorFee)
    {
        protocolFee = (_amount * Params.liquidationProtocolFeeRate()).div(Constants.PCT_DIGIT);
        liquidatorFee = (_amount * Params.liquidatorFeeRate()).div(Constants.PCT_DIGIT);
    }

    function transferFrom(
        bytes32 _ccy,
        address _from,
        address _to,
        uint256 _amount
    ) external returns (uint256 untransferredAmount) {
        uint256 depositAmount = Storage.slot().depositAmounts[_from][_ccy];
        uint256 amount = depositAmount >= _amount ? _amount : depositAmount;
        untransferredAmount = _amount - amount;

        removeDepositAmount(_from, _ccy, amount);
        addDepositAmount(_to, _ccy, amount);
    }

    /**
     * @notice Gets the total of amount deposited in the user's collateral of all currencies
     *  in this contract by converting it to ETH.
     * @param _user Address of collateral user
     * @return totalDepositAmount The total deposited amount in ETH
     */
    function _getTotalInternalDepositAmountInBaseCurrency(address _user)
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
                totalDepositAmount += AddressResolverLib.currencyController().convertToBaseCurrency(
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
