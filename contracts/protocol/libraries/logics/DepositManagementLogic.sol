// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// dependencies
import {EnumerableSet} from "../../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
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

    error NotEnoughDeposit(bytes32 ccy);
    error CollateralIsZero(bytes32 ccy);
    error ProtocolIsInsolvent(bytes32 ccy);

    struct CalculatedFundVars {
        uint256 plusDepositAmountInAdditionalFundsCcy;
        uint256 minusDepositAmountInAdditionalFundsCcy;
        uint256 workingLendOrdersAmount;
        uint256 collateralAmount;
        uint256 lentAmount;
        uint256 workingBorrowOrdersAmount;
        uint256 debtAmount;
        uint256 borrowedAmount;
    }

    function isCovered(address _user) public view returns (bool) {
        (uint256 totalCollateral, uint256 totalUsedCollateral, ) = _getCollateral(_user);

        return
            totalUsedCollateral == 0 ||
            (totalCollateral * Constants.PCT_DIGIT >=
                totalUsedCollateral * Params.liquidationThresholdRate());
    }

    function getUsedCurrencies(address _user) public view returns (bytes32[] memory) {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];

        uint256 length = currencySet.length();
        bytes32[] memory currencies = new bytes32[](length);

        for (uint256 i; i < length; i++) {
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
        ) = AddressResolverLib.lendingMarketController().calculateFunds(
                _ccy,
                _user,
                Params.liquidationThresholdRate()
            );

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
        return _getCollateral(_user);
    }

    function getCollateralAmount(address _user, bytes32 _ccy)
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
        ) = AddressResolverLib.lendingMarketController().calculateFunds(
                _ccy,
                _user,
                Params.liquidationThresholdRate()
            );

        uint256 plusDeposit = Storage.slot().depositAmounts[_user][_ccy] + borrowedAmount;
        uint256 minusDeposit = workingLendOrdersAmount + lentAmount;
        uint256 plusCollateral = plusDeposit + collateralAmount;

        totalCollateral = plusCollateral >= minusDeposit ? plusCollateral - minusDeposit : 0;
        totalUsedCollateral = workingBorrowOrdersAmount + debtAmount;
        totalDeposit = plusDeposit >= minusDeposit ? plusDeposit - minusDeposit : 0;
    }

    function getCoverage(address _user) external view returns (uint256 coverage) {
        ILendingMarketController.AdditionalFunds memory _emptyAdditionalFunds;
        (coverage, ) = calculateCoverage(_user, _emptyAdditionalFunds);
    }

    function calculateCoverage(
        address _user,
        ILendingMarketController.AdditionalFunds memory _additionalFunds
    ) public view returns (uint256 coverage, bool isInsufficientDepositAmount) {
        uint256 totalCollateral;
        uint256 totalUsedCollateral;

        (
            totalCollateral,
            totalUsedCollateral,
            ,
            isInsufficientDepositAmount
        ) = _calculateCollateral(_user, _additionalFunds);

        if (totalCollateral == 0) {
            coverage = totalUsedCollateral == 0 ? 0 : type(uint256).max;
        } else {
            coverage = (totalUsedCollateral * Constants.PCT_DIGIT) / totalCollateral;
        }
    }

    function _getCollateral(address _user)
        internal
        view
        returns (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalDeposit
        )
    {
        ILendingMarketController.AdditionalFunds memory _funds;
        (totalCollateral, totalUsedCollateral, totalDeposit, ) = _calculateCollateral(
            _user,
            _funds
        );
    }

    function _calculateCollateral(
        address _user,
        ILendingMarketController.AdditionalFunds memory _funds
    )
        internal
        view
        returns (
            uint256 totalCollateral,
            uint256 totalUsedCollateral,
            uint256 totalDeposit,
            bool isInsufficientDepositAmount
        )
    {
        CalculatedFundVars memory vars;

        (
            vars.plusDepositAmountInAdditionalFundsCcy,
            vars.minusDepositAmountInAdditionalFundsCcy,
            vars.workingLendOrdersAmount,
            ,
            vars.collateralAmount,
            vars.lentAmount,
            vars.workingBorrowOrdersAmount,
            vars.debtAmount,
            vars.borrowedAmount
        ) = AddressResolverLib.lendingMarketController().calculateTotalFundsInBaseCurrency(
            _user,
            _funds,
            Params.liquidationThresholdRate()
        );

        // Check if the user has enough deposit amount for lending in the selected currency.
        if (
            _funds.lentAmount != 0 &&
            (vars.plusDepositAmountInAdditionalFundsCcy +
                Storage.slot().depositAmounts[_user][_funds.ccy] <
                vars.minusDepositAmountInAdditionalFundsCcy)
        ) {
            isInsufficientDepositAmount = true;
        }

        uint256 totalInternalDepositAmount = _getTotalInternalDepositAmountInBaseCurrency(_user);

        uint256 plusDeposit = totalInternalDepositAmount + vars.borrowedAmount;
        uint256 minusDeposit = vars.workingLendOrdersAmount + vars.lentAmount;
        uint256 plusCollateral = plusDeposit + vars.collateralAmount;

        totalCollateral = plusCollateral >= minusDeposit ? plusCollateral - minusDeposit : 0;
        totalUsedCollateral = vars.workingBorrowOrdersAmount + vars.debtAmount;
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
            uint256 maxWithdrawInNativeToken = getWithdrawableCollateral(_user);
            uint256 maxWithdraw = AddressResolverLib.currencyController().convertFromBaseCurrency(
                _ccy,
                maxWithdrawInNativeToken
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
        if (Storage.slot().depositAmounts[_user][_ccy] < _amount) {
            revert NotEnoughDeposit({ccy: _ccy});
        }

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

        if (Storage.slot().totalDepositAmount[_ccy] < withdrawableAmount) {
            revert ProtocolIsInsolvent({ccy: _ccy});
        }

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

        (uint256 collateralAmount, , ) = getCollateralAmount(_user, _liquidationCcy);

        if (collateralAmount == 0) revert CollateralIsZero({ccy: _liquidationCcy});

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
        uint256 length = currencies.length();

        for (uint256 i; i < length; i++) {
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
