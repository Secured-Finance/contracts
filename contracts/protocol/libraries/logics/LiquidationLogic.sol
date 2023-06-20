// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeCast} from "../../../dependencies/openzeppelin/contracts/utils/math/SafeCast.sol";
// interfaces
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {FundManagementLogic} from "./FundManagementLogic.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";
// liquidation
import {ILiquidationReceiver} from "../../../liquidators/interfaces/ILiquidationReceiver.sol";

library LiquidationLogic {
    using SafeCast for uint256;
    using SafeCast for int256;

    struct ExecuteLiquidationVars {
        address reserveFund;
        uint256 liquidationAmountInCollateralCcy;
        uint256 liquidationAmountInDebtCcy;
        uint256 protocolFeeInCollateralCcy;
        uint256 liquidatorFeeInCollateralCcy;
        bool isDefaultMarket;
        bool isReserveFundPaused;
        uint256 receivedCollateralAmount;
        uint256 receivedDebtAmount;
    }

    event LiquidationExecuted(
        address indexed user,
        bytes32 collateralCcy,
        bytes32 indexed debtCcy,
        uint256 indexed debtMaturity,
        uint256 debtAmount
    );

    event ForcedRepaymentExecuted(
        address indexed user,
        bytes32 collateralCcy,
        bytes32 indexed debtCcy,
        uint256 indexed debtMaturity,
        uint256 debtAmount
    );

    function executeLiquidation(
        address _liquidator,
        address _user,
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity
    ) external {
        ExecuteLiquidationVars memory vars;

        // In order to liquidate using user collateral, inactive order IDs must be cleaned
        // and converted to actual funds first.
        FundManagementLogic.cleanUpFunds(_collateralCcy, _user);
        FundManagementLogic.cleanUpFunds(_debtCcy, _user);

        uint256 debtAmount = FundManagementLogic
            .calculateActualFunds(_debtCcy, _debtMaturity, _user)
            .debtAmount;

        require(debtAmount != 0, "No debt in the selected maturity");

        (
            vars.liquidationAmountInCollateralCcy,
            vars.protocolFeeInCollateralCcy,
            vars.liquidatorFeeInCollateralCcy
        ) = AddressResolverLib.tokenVault().getLiquidationAmount(
            _user,
            _collateralCcy,
            AddressResolverLib.currencyController().convert(_debtCcy, _collateralCcy, debtAmount)
        );

        require(vars.liquidationAmountInCollateralCcy != 0, "User has enough collateral");

        vars.liquidationAmountInDebtCcy = AddressResolverLib.currencyController().convert(
            _collateralCcy,
            _debtCcy,
            vars.liquidationAmountInCollateralCcy
        );

        vars.isDefaultMarket =
            Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity] ==
            Storage.slot().lendingMarkets[_debtCcy][0];
        vars.isReserveFundPaused = AddressResolverLib.reserveFund().isPaused();
        vars.reserveFund = address(AddressResolverLib.reserveFund());

        // Transfer collateral from users to liquidators and reserve funds.
        vars.receivedCollateralAmount =
            vars.liquidationAmountInCollateralCcy +
            vars.liquidatorFeeInCollateralCcy;

        uint256 untransferredAmount = _transferCollateralForLiquidation(
            _user,
            _liquidator,
            _collateralCcy,
            vars.receivedCollateralAmount,
            vars.protocolFeeInCollateralCcy
        );

        // Cover insolvent amounts using reserve funds.
        if (untransferredAmount > 0 && !vars.isReserveFundPaused) {
            uint256 insolventAmountInDebtCcy = AddressResolverLib.currencyController().convert(
                _collateralCcy,
                _debtCcy,
                untransferredAmount
            );

            if (AddressResolverLib.tokenVault().getTotalCollateralAmount(_user) == 0) {
                insolventAmountInDebtCcy = _transferFunds(
                    vars.reserveFund,
                    _liquidator,
                    _debtCcy,
                    _debtMaturity,
                    insolventAmountInDebtCcy.toInt256(),
                    vars.isDefaultMarket
                ).toUint256();
            }

            vars.liquidationAmountInDebtCcy -= insolventAmountInDebtCcy;
        }

        if (_liquidator.code.length > 0) {
            require(
                ILiquidationReceiver(_liquidator).executeOperationForCollateral(
                    _liquidator,
                    _user,
                    _collateralCcy,
                    vars.receivedCollateralAmount
                ),
                "Invalid operation execution"
            );
        }

        // Transfer the debt from users to liquidators
        if (vars.liquidationAmountInDebtCcy > 0) {
            vars.receivedDebtAmount = vars.liquidationAmountInDebtCcy;

            _transferFunds(
                _user,
                _liquidator,
                _debtCcy,
                _debtMaturity,
                -vars.receivedDebtAmount.toInt256(),
                vars.isDefaultMarket
            );

            if (_liquidator.code.length > 0) {
                require(
                    ILiquidationReceiver(_liquidator).executeOperationForDebt(
                        _liquidator,
                        _user,
                        _collateralCcy,
                        vars.receivedCollateralAmount,
                        _debtCcy,
                        _debtMaturity,
                        vars.receivedDebtAmount
                    ),
                    "Invalid operation execution"
                );
            }
        }

        require(AddressResolverLib.tokenVault().isCovered(msg.sender), "Invalid liquidation");

        emit LiquidationExecuted(
            _user,
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            vars.liquidationAmountInDebtCcy
        );
    }

    function executeForcedRepayment(
        address _executor,
        address _user,
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity
    ) external {
        require(
            !AddressResolverLib.currencyController().currencyExists(_debtCcy),
            "Currency is active"
        );
        require(block.timestamp >= _debtMaturity + 1 weeks, "Invalid repayment");

        ExecuteLiquidationVars memory vars;

        // In order to liquidate using user collateral, inactive order IDs must be cleaned
        // and converted to actual funds first.
        FundManagementLogic.cleanUpFunds(_collateralCcy, _user);
        FundManagementLogic.cleanUpFunds(_debtCcy, _user);

        FundManagementLogic.ActualFunds memory funds = FundManagementLogic.calculateActualFunds(
            _debtCcy,
            _debtMaturity,
            _user
        );

        require(funds.futureValue < 0, "No debt in the selected maturity");

        vars.liquidationAmountInDebtCcy = (-funds.futureValue).toUint256();
        vars.liquidationAmountInCollateralCcy = AddressResolverLib.currencyController().convert(
            _debtCcy,
            _collateralCcy,
            vars.liquidationAmountInDebtCcy
        );

        (vars.protocolFeeInCollateralCcy, vars.liquidatorFeeInCollateralCcy) = AddressResolverLib
            .tokenVault()
            .calculateLiquidationFees(vars.liquidationAmountInCollateralCcy);

        // Transfer collateral from users to liquidators and reserve funds.
        vars.receivedCollateralAmount =
            vars.liquidationAmountInCollateralCcy +
            vars.liquidatorFeeInCollateralCcy;

        _transferCollateralForLiquidation(
            _user,
            _executor,
            _collateralCcy,
            vars.receivedCollateralAmount,
            vars.protocolFeeInCollateralCcy
        );

        if (_executor.code.length > 0) {
            require(
                ILiquidationReceiver(_executor).executeOperationForCollateral(
                    _executor,
                    _user,
                    _collateralCcy,
                    vars.receivedCollateralAmount
                ),
                "Invalid operation execution"
            );
        }

        // Transfer the debt from users to liquidators
        vars.receivedDebtAmount = vars.liquidationAmountInDebtCcy;

        // _transferFunds(
        //     _user,
        //     _executor,
        //     _debtCcy,
        //     _debtMaturity,
        //     -vars.receivedDebtAmount.toInt256(),
        //     vars.isDefaultMarket
        // );

        if (_executor.code.length > 0) {
            require(
                ILiquidationReceiver(_executor).executeOperationForDebt(
                    _executor,
                    _user,
                    _collateralCcy,
                    vars.receivedCollateralAmount,
                    _debtCcy,
                    _debtMaturity,
                    vars.receivedDebtAmount
                ),
                "Invalid operation execution"
            );
        }

        // require(
        //     AddressResolverLib.tokenVault().transferFrom(
        //         _debtCcy,
        //         _executor,
        //         _user,
        //         vars.liquidationAmountInDebtCcy
        //     ) == 0,
        //     "Not enough collateral in the selected currency"
        // );

        // FundManagementLogic.executeRepayment(_debtCcy, _debtMaturity, _user);

        AddressResolverLib.tokenVault().transferFrom(
            _debtCcy,
            _executor,
            _user,
            vars.liquidationAmountInDebtCcy
        );

        uint256 repaymentAmount = FundManagementLogic.executeRepayment(
            _debtCcy,
            _debtMaturity,
            _user
        );

        require(repaymentAmount >= vars.liquidationAmountInDebtCcy, "Invalid repayment amount");

        emit ForcedRepaymentExecuted(
            _user,
            _collateralCcy,
            _debtCcy,
            _debtMaturity,
            vars.liquidationAmountInDebtCcy
        );
    }

    function _transferCollateralForLiquidation(
        address _from,
        address _to,
        bytes32 _ccy,
        uint256 _amount,
        uint256 _fee
    ) internal returns (uint256 untransferredAmount) {
        address reserveFund = address(AddressResolverLib.reserveFund());

        untransferredAmount = AddressResolverLib.tokenVault().transferFrom(
            _ccy,
            _from,
            reserveFund,
            _fee
        );

        // If `untransferredAmount` is not 0, the user has not enough deposit in the collateral currency.
        // Therefore, the liquidators and the reserve fund obtain zero-coupon bonds instead of the user's collateral.
        if (untransferredAmount > 0) {
            _transferFunds(_from, reserveFund, _ccy, untransferredAmount.toInt256());
            untransferredAmount = _amount;
        } else {
            untransferredAmount = AddressResolverLib.tokenVault().transferFrom(
                _ccy,
                _from,
                _to,
                _amount
            );
        }

        if (untransferredAmount > 0) {
            untransferredAmount = _transferFunds(_from, _to, _ccy, untransferredAmount.toInt256())
                .toUint256();
        }
    }

    function _transferFunds(
        address _from,
        address _to,
        bytes32 _ccy,
        int256 _amount
    ) internal returns (int256 untransferredAmount) {
        uint256[] memory maturities = FundManagementLogic.getUsedMaturities(_ccy, _from);
        address defaultMarketAddress = Storage.slot().lendingMarkets[_ccy][0];
        untransferredAmount = _amount;

        for (uint256 i; i < maturities.length; i++) {
            if (untransferredAmount == 0) {
                break;
            }

            untransferredAmount = _transferFunds(
                _from,
                _to,
                _ccy,
                maturities[i],
                untransferredAmount,
                Storage.slot().maturityLendingMarkets[_ccy][maturities[i]] == defaultMarketAddress
            );
        }
    }

    function _transferFunds(
        address _from,
        address _to,
        bytes32 _ccy,
        uint256 _maturity,
        int256 _amount,
        bool _isDefaultMarket
    ) internal returns (int256 untransferredAmount) {
        untransferredAmount = _amount;
        bool isDebt = _amount < 0;

        if (_isDefaultMarket) {
            int256 userGVAmount = AddressResolverLib.genesisValueVault().getGenesisValue(
                _ccy,
                _from
            );

            if ((isDebt && userGVAmount < 0) || (!isDebt && userGVAmount > 0)) {
                uint256 currentMaturity = AddressResolverLib.genesisValueVault().getCurrentMaturity(
                    _ccy
                );

                int256 gvAmount = AddressResolverLib.genesisValueVault().calculateGVFromFV(
                    _ccy,
                    0,
                    FundManagementLogic.calculateFVFromPV(
                        _ccy,
                        currentMaturity,
                        untransferredAmount
                    )
                );

                if ((isDebt && userGVAmount > gvAmount) || (!isDebt && userGVAmount < gvAmount)) {
                    gvAmount = userGVAmount;
                }

                // Due to the negative genesis value, the liquidator's genesis value is decreased.
                AddressResolverLib.genesisValueVault().transferFrom(_ccy, _from, _to, gvAmount);

                untransferredAmount -= FundManagementLogic.calculatePVFromFV(
                    _ccy,
                    currentMaturity,
                    AddressResolverLib.genesisValueVault().calculateFVFromGV(_ccy, 0, gvAmount)
                );
            }
        }

        IFutureValueVault futureValueVault = IFutureValueVault(
            Storage.slot().futureValueVaults[_ccy][
                Storage.slot().maturityLendingMarkets[_ccy][_maturity]
            ]
        );

        (int256 userFVAmount, ) = futureValueVault.getFutureValue(_from);

        if ((isDebt && userFVAmount < 0) || (!isDebt && userFVAmount > 0)) {
            int256 fvAmount = FundManagementLogic.calculateFVFromPV(
                _ccy,
                _maturity,
                untransferredAmount
            );

            if ((isDebt && userFVAmount > fvAmount) || (!isDebt && userFVAmount < fvAmount)) {
                fvAmount = userFVAmount;
            }

            futureValueVault.transferFrom(_from, _to, fvAmount, _maturity);
            untransferredAmount -= FundManagementLogic.calculatePVFromFV(_ccy, _maturity, fvAmount);
        }

        if (_amount != untransferredAmount) {
            FundManagementLogic.registerCurrencyAndMaturity(_ccy, _maturity, _to);
        }
    }
}
