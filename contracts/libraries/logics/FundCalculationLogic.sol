// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {RoundingInt256} from "../math/RoundingInt256.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";

library FundCalculationLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using RoundingUint256 for uint256;
    using RoundingInt256 for int256;

    event UpdateOrderFeeRate(uint256 previousRate, uint256 ratio);

    struct CalculatedAmountVars {
        address debtMarket;
        uint256 debtFVAmount;
        uint256 debtPVAmount;
        uint256 estimatedDebtPVAmount;
        uint256 liquidationPVAmount;
        uint256 offsetGVAmount;
    }

    struct CalculatedTotalFundInETHVars {
        bool[] isCollateral;
        bytes32 ccy;
        uint256[] amounts;
        uint256[] amountsInETH;
        uint256 plusDepositAmount;
        uint256 minusDepositAmount;
    }

    function updateOrderFeeRate(bytes32 _ccy, uint256 _orderFeeRate) internal {
        require(_orderFeeRate <= ProtocolTypes.PCT_DIGIT, "Invalid order fee rate");

        if (_orderFeeRate != Storage.slot().orderFeeRates[_ccy]) {
            emit UpdateOrderFeeRate(Storage.slot().orderFeeRates[_ccy], _orderFeeRate);
            Storage.slot().orderFeeRates[_ccy] = _orderFeeRate;
        }
    }

    function calculateOrderFeeAmount(
        bytes32 _ccy,
        uint256 _amount,
        uint256 _maturity
    ) public view returns (uint256 orderFeeAmount) {
        require(block.timestamp < _maturity, "Invalid maturity");
        uint256 currentMaturity = _maturity - block.timestamp;

        // NOTE: The formula is:
        // actualRate = feeRate * (currentMaturity / SECONDS_IN_YEAR)
        // orderFeeAmount = amount * actualRate
        orderFeeAmount = (Storage.slot().orderFeeRates[_ccy] * currentMaturity * _amount).div(
            ProtocolTypes.SECONDS_IN_YEAR * ProtocolTypes.PCT_DIGIT
        );
    }

    function convertToLiquidationAmountFromCollateral(
        address _liquidator,
        address _user,
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        uint24 _poolFee
    ) public returns (uint256 liquidationPVAmount, uint256 offsetPVAmount) {
        CalculatedAmountVars memory vars;

        uint256 liquidationPVAmountInETH = AddressResolverLib.tokenVault().getLiquidationAmount(
            _user
        );
        require(liquidationPVAmountInETH != 0, "User has enough collateral");

        int256 futureValueAmount = calculateActualFutureValue(_debtCcy, _debtMaturity, _user);
        require(futureValueAmount < 0, "No debt in the selected maturity");

        vars.debtMarket = Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity];
        vars.debtFVAmount = uint256(-futureValueAmount);
        vars.debtPVAmount = uint256(
            _calculatePVFromFVInMaturity(
                _debtCcy,
                _debtMaturity,
                -futureValueAmount,
                vars.debtMarket
            )
        );

        vars.liquidationPVAmount = AddressResolverLib.currencyController().convertFromETH(
            _debtCcy,
            liquidationPVAmountInETH
        );

        // If the debt amount is less than the liquidation amount, the debt amount is used as the liquidation amount.
        // In that case, the actual liquidation ratio is under the liquidation threshold ratio.
        vars.liquidationPVAmount = vars.liquidationPVAmount > vars.debtPVAmount
            ? vars.debtPVAmount
            : vars.liquidationPVAmount;

        if (!AddressResolverLib.reserveFund().isPaused()) {
            // Offset the user's debt using the future value amount and the genesis value amount hold by the reserve fund contract.
            // Before this step, the target user's order must be cleaned up by `LendingMarketController#cleanOrders` function.
            // If the target market is the nearest market(default market), the genesis value is used for the offset.
            bool isDefaultMarket = Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity] ==
                Storage.slot().lendingMarkets[_debtCcy][0];

            if (isDefaultMarket) {
                vars.offsetGVAmount = _offsetGenesisValue(
                    _debtCcy,
                    _debtMaturity,
                    address(AddressResolverLib.reserveFund()),
                    _user,
                    uint256(
                        AddressResolverLib.genesisValueVault().calculateGVFromFV(
                            _debtCcy,
                            _debtMaturity,
                            int256(vars.liquidationPVAmount)
                        )
                    )
                );

                if (vars.offsetGVAmount > 0) {
                    offsetPVAmount = uint256(
                        _calculatePVFromFVInMaturity(
                            _debtCcy,
                            _debtMaturity,
                            AddressResolverLib.genesisValueVault().calculateFVFromGV(
                                _debtCcy,
                                _debtMaturity,
                                int256(vars.offsetGVAmount)
                            ),
                            vars.debtMarket
                        )
                    );
                }
            }

            uint256 offsetFVAmount = _offsetFutureValue(
                _debtCcy,
                _debtMaturity,
                address(AddressResolverLib.reserveFund()),
                _user,
                _calculateFVFromPV(
                    _debtCcy,
                    _debtMaturity,
                    vars.liquidationPVAmount - offsetPVAmount
                )
            );

            if (offsetFVAmount > 0) {
                offsetPVAmount += uint256(
                    _calculatePVFromFVInMaturity(
                        _debtCcy,
                        _debtMaturity,
                        int256(offsetFVAmount),
                        vars.debtMarket
                    )
                );
            }
        }

        // Estimate the filled amount from actual orders in the order book using the future value of user debt.
        // If the estimated amount is less than the liquidation amount, the estimated amount is used as
        // the liquidation amount.
        vars.estimatedDebtPVAmount = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity]
        ).estimateFilledAmount(ProtocolTypes.Side.LEND, vars.debtFVAmount);

        uint256 swapPVAmount = vars.liquidationPVAmount > vars.estimatedDebtPVAmount
            ? vars.estimatedDebtPVAmount
            : vars.liquidationPVAmount;

        // Swap collateral from deposited currency to debt currency using Uniswap.
        // This swapped collateral is used to unwind the debt.
        liquidationPVAmount = AddressResolverLib.tokenVault().swapDepositAmounts(
            _liquidator,
            _user,
            _collateralCcy,
            _debtCcy,
            swapPVAmount,
            _poolFee,
            offsetPVAmount
        );
    }

    function calculateActualFutureValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (int256 futureValue) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        bool isDefaultMarket = market == Storage.slot().lendingMarkets[_ccy][0];

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address currentMarket = Storage.slot().lendingMarkets[_ccy][i];
            uint256 currentMaturity = ILendingMarket(currentMarket).getMaturity();

            if (isDefaultMarket || currentMarket == market) {
                // Get FV from Future Value Vault
                (int256 futureValueInMaturity, uint256 fvMaturity) = IFutureValueVault(
                    Storage.slot().futureValueVaults[_ccy][currentMarket]
                ).getFutureValue(_user);

                if (isDefaultMarket && (i == 0 || currentMaturity != fvMaturity)) {
                    futureValue += _calculateCurrentFVFromFVInMaturity(
                        _ccy,
                        fvMaturity,
                        futureValueInMaturity,
                        currentMarket
                    );
                } else if (!isDefaultMarket && currentMaturity == fvMaturity) {
                    futureValue += futureValueInMaturity;
                }

                // Get FV from inactive borrow orders
                (, , uint256 borrowFVInMaturity, uint256 borrowOrdersMaturity) = ILendingMarket(
                    currentMarket
                ).getTotalAmountFromBorrowOrders(_user);

                if (isDefaultMarket && (i == 0 || currentMaturity != borrowOrdersMaturity)) {
                    futureValue -= _calculateCurrentFVFromFVInMaturity(
                        _ccy,
                        borrowOrdersMaturity,
                        int256(borrowFVInMaturity),
                        currentMarket
                    );
                } else if (!isDefaultMarket && currentMaturity == borrowOrdersMaturity) {
                    futureValue -= int256(borrowFVInMaturity);
                }

                // Get FV from inactive lend orders
                (, , uint256 lendFVInMaturity, uint256 lendOrdersMaturity) = ILendingMarket(
                    currentMarket
                ).getTotalAmountFromLendOrders(_user);

                if ((isDefaultMarket && (i == 0 || currentMaturity != lendOrdersMaturity))) {
                    futureValue += _calculateCurrentFVFromFVInMaturity(
                        _ccy,
                        lendOrdersMaturity,
                        int256(lendFVInMaturity),
                        currentMarket
                    );
                } else if (!isDefaultMarket && currentMaturity == lendOrdersMaturity) {
                    futureValue += int256(lendFVInMaturity);
                }
            }
        }

        // Add FV from Genesis Value Vault if the market is that the lending position is rolled to.
        if (isDefaultMarket) {
            futureValue += AddressResolverLib.genesisValueVault().getGenesisValueInFutureValue(
                _ccy,
                _user
            );
        }
    }

    function calculateActualPresentValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (int256 presentValue) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        bool isDefaultMarket = market == Storage.slot().lendingMarkets[_ccy][0];

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address currentMarket = Storage.slot().lendingMarkets[_ccy][i];
            uint256 currentMaturity = ILendingMarket(currentMarket).getMaturity();

            if (isDefaultMarket || currentMarket == market) {
                // Get PV from Future Value Vault
                (int256 futureValueInMaturity, uint256 fvMaturity) = IFutureValueVault(
                    Storage.slot().futureValueVaults[_ccy][currentMarket]
                ).getFutureValue(_user);

                if (
                    (isDefaultMarket && (i == 0 || currentMaturity != fvMaturity)) ||
                    (!isDefaultMarket && currentMaturity == fvMaturity)
                ) {
                    presentValue += _calculatePVFromFVInMaturity(
                        _ccy,
                        fvMaturity,
                        futureValueInMaturity,
                        currentMarket
                    );
                }

                // Get PV from inactive borrow orders
                (, , uint256 borrowFVInMaturity, uint256 borrowOrdersMaturity) = ILendingMarket(
                    currentMarket
                ).getTotalAmountFromBorrowOrders(_user);

                if (
                    (isDefaultMarket && (i == 0 || currentMaturity != borrowOrdersMaturity)) ||
                    (!isDefaultMarket && currentMaturity == borrowOrdersMaturity)
                ) {
                    presentValue -= _calculatePVFromFVInMaturity(
                        _ccy,
                        borrowOrdersMaturity,
                        int256(borrowFVInMaturity),
                        currentMarket
                    );
                }

                // Get PV from inactive lend orders
                (, , uint256 lendFVInMaturity, uint256 lendOrdersMaturity) = ILendingMarket(
                    currentMarket
                ).getTotalAmountFromLendOrders(_user);

                if (
                    (isDefaultMarket && (i == 0 || currentMaturity != lendOrdersMaturity)) ||
                    (!isDefaultMarket && currentMaturity == lendOrdersMaturity)
                ) {
                    presentValue += _calculatePVFromFVInMaturity(
                        _ccy,
                        lendOrdersMaturity,
                        int256(lendFVInMaturity),
                        currentMarket
                    );
                }
            }
        }

        // Add PV from Genesis Value Vault if the market is that the lending position is rolled to.
        if (isDefaultMarket) {
            presentValue += _calculatePVFromFV(
                AddressResolverLib.genesisValueVault().getGenesisValueInFutureValue(_ccy, _user),
                ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice()
            );
        }
    }

    function calculateActualPresentValue(bytes32 _ccy, address _user)
        public
        view
        returns (int256 totalPresentValue)
    {
        // Get PV from Future Value Vault and Genesis Value Vault.
        totalPresentValue = _getTotalPresentValue(_ccy, _user);

        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address market = Storage.slot().lendingMarkets[_ccy][i];

            // Get PV from inactive borrow orders
            (, , uint256 borrowFVInMaturity, uint256 borrowOrdersMaturity) = ILendingMarket(market)
                .getTotalAmountFromBorrowOrders(_user);

            totalPresentValue -= _calculatePVFromFVInMaturity(
                _ccy,
                borrowOrdersMaturity,
                int256(borrowFVInMaturity),
                market
            );

            // Get PV from inactive lend orders
            (, , uint256 lendFVInMaturity, uint256 lendOrdersMaturity) = ILendingMarket(market)
                .getTotalAmountFromLendOrders(_user);

            totalPresentValue += _calculatePVFromFVInMaturity(
                _ccy,
                lendOrdersMaturity,
                int256(lendFVInMaturity),
                market
            );
        }
    }

    function calculateLentFundsFromOrders(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 totalWorkingOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalLentAmount
        )
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 workingOrdersAmount,
                uint256 claimableAmount,
                uint256 lentAmount
            ) = _calculateLentFundsFromOrders(_ccy, Storage.slot().lendingMarkets[_ccy][i], _user);

            totalWorkingOrdersAmount += workingOrdersAmount;
            totalClaimableAmount += claimableAmount;
            totalLentAmount += lentAmount;
        }
    }

    function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 totalWorkingOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount
        )
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 workingOrdersAmount,
                uint256 debtAmount,
                uint256 borrowedAmount
            ) = _calculateBorrowedFundsFromOrders(
                    _ccy,
                    Storage.slot().lendingMarkets[_ccy][i],
                    _user
                );

            totalWorkingOrdersAmount += workingOrdersAmount;
            totalDebtAmount += debtAmount;
            totalBorrowedAmount += borrowedAmount;
        }
    }

    function calculateLentFundsFromOrders(
        bytes32 _ccy,
        address _market,
        address _user
    )
        public
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 claimableAmount,
            uint256 lentAmount
        )
    {
        return _calculateLentFundsFromOrders(_ccy, _market, _user);
    }

    function calculateBorrowedFundsFromOrders(
        bytes32 _ccy,
        address _market,
        address _user
    )
        public
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        return _calculateBorrowedFundsFromOrders(_ccy, _market, _user);
    }

    function calculateFunds(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 workingLendOrdersAmount,
            uint256 claimableAmount,
            uint256 collateralAmount,
            uint256 lentAmount,
            uint256 workingBorrowOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        (workingLendOrdersAmount, claimableAmount, lentAmount) = calculateLentFundsFromOrders(
            _ccy,
            _user
        );
        (workingBorrowOrdersAmount, debtAmount, borrowedAmount) = calculateBorrowedFundsFromOrders(
            _ccy,
            _user
        );
        collateralAmount = claimableAmount;

        // Calculate total present value from Future Value Vault and Genesis Value Vault.
        int256 totalPresentValue = _getTotalPresentValue(_ccy, _user);
        if (totalPresentValue >= 0) {
            // Add to claimableAmount
            claimableAmount += uint256(totalPresentValue);
        } else {
            // Add to debtAmount
            debtAmount += uint256(-totalPresentValue);
        }

        if (claimableAmount > 0) {
            uint256 haircut = AddressResolverLib.currencyController().getHaircut(_ccy);
            collateralAmount = (claimableAmount * haircut).div(ProtocolTypes.PCT_DIGIT);
        }
    }

    function calculateTotalFundsInETH(
        address _user,
        bytes32 _depositCcy,
        uint256 _depositAmount
    )
        external
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount,
            bool isEnoughDeposit
        )
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];
        CalculatedTotalFundInETHVars memory vars;

        vars.isCollateral = AddressResolverLib.tokenVault().isCollateral(currencySet.values());
        vars.plusDepositAmount = _depositAmount;

        // Calculate total funds from the user's order list
        for (uint256 i = 0; i < currencySet.length(); i++) {
            vars.ccy = currencySet.at(i);
            vars.amounts = new uint256[](7);

            // 0: workingLendOrdersAmount
            // 1: claimableAmount
            // 2: collateralAmount
            // 3: lentAmount
            // 4: workingBorrowOrdersAmount
            // 5: debtAmount
            // 6: borrowedAmount
            (
                vars.amounts[0],
                vars.amounts[1],
                vars.amounts[2],
                vars.amounts[3],
                vars.amounts[4],
                vars.amounts[5],
                vars.amounts[6]
            ) = calculateFunds(vars.ccy, _user);

            if (vars.ccy == _depositCcy) {
                // plusDepositAmount: depositAmount + borrowedAmount
                // minusDepositAmount: workingLendOrdersAmount + lentAmount
                vars.plusDepositAmount += vars.amounts[6];
                vars.minusDepositAmount += vars.amounts[0] + vars.amounts[3];
            }

            vars.amountsInETH = AddressResolverLib.currencyController().convertToETH(
                vars.ccy,
                vars.amounts
            );

            totalClaimableAmount += vars.amountsInETH[1];
            totalCollateralAmount += vars.amountsInETH[2];
            totalWorkingBorrowOrdersAmount += vars.amountsInETH[4];
            totalDebtAmount += vars.amountsInETH[5];

            // NOTE: Lent amount and working lend orders amount are excluded here as they are not used
            // for the collateral calculation.
            // Those amounts need only to check whether there is enough deposit amount in the selected currency.
            if (vars.isCollateral[i]) {
                totalWorkingLendOrdersAmount += vars.amountsInETH[0];
                totalLentAmount += vars.amountsInETH[3];
                totalBorrowedAmount += vars.amountsInETH[6];
            }
        }

        // Check if the user has enough collateral in the selected currency.
        isEnoughDeposit = vars.plusDepositAmount >= vars.minusDepositAmount;
    }

    function _calculateCurrentFVFromFVInMaturity(
        bytes32 _ccy,
        uint256 maturity,
        int256 futureValueInMaturity,
        address lendingMarketInMaturity
    ) internal view returns (int256 futureValue) {
        if (
            AddressResolverLib
                .genesisValueVault()
                .getMaturityUnitPrice(_ccy, maturity)
                .compoundFactor == 0
        ) {
            uint256 unitPriceInMaturity = ILendingMarket(lendingMarketInMaturity).getMidUnitPrice();
            int256 presetValue = _calculatePVFromFV(futureValueInMaturity, unitPriceInMaturity);
            uint256 currentUnitPrice = ILendingMarket(Storage.slot().lendingMarkets[_ccy][0])
                .getMidUnitPrice();

            futureValue = (presetValue * int256(ProtocolTypes.PRICE_DIGIT)).div(
                int256(currentUnitPrice)
            );
        } else {
            futureValue = AddressResolverLib.genesisValueVault().calculateCurrentFVFromFVInMaturity(
                    _ccy,
                    maturity,
                    futureValueInMaturity
                );
        }
    }

    function _calculateFVFromPV(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _presentValue
    ) internal view returns (uint256) {
        uint256 unitPrice = ILendingMarket(Storage.slot().maturityLendingMarkets[_ccy][_maturity])
            .getMidUnitPrice();

        // NOTE: The formula is: futureValue = presentValue / unitPrice.
        return (_presentValue * ProtocolTypes.PRICE_DIGIT).div(unitPrice);
    }

    function _calculatePVFromFVInMaturity(
        bytes32 _ccy,
        uint256 maturity,
        int256 futureValueInMaturity,
        address lendingMarketInMaturity
    ) internal view returns (int256 totalPresentValue) {
        uint256 compoundFactorInMaturity = AddressResolverLib
            .genesisValueVault()
            .getMaturityUnitPrice(_ccy, maturity)
            .compoundFactor;
        int256 futureValue;
        uint256 unitPrice;

        if (compoundFactorInMaturity == 0) {
            futureValue = futureValueInMaturity;
            unitPrice = ILendingMarket(lendingMarketInMaturity).getMidUnitPrice();
        } else {
            futureValue = AddressResolverLib.genesisValueVault().calculateCurrentFVFromFVInMaturity(
                    _ccy,
                    maturity,
                    futureValueInMaturity
                );
            unitPrice = ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice();
        }

        return _calculatePVFromFV(futureValue, unitPrice);
    }

    function _calculatePVFromFV(int256 _futureValue, uint256 _unitPrice)
        internal
        pure
        returns (int256)
    {
        // NOTE: The formula is: presentValue = futureValue * unitPrice.
        return (_futureValue * int256(_unitPrice)).div(int256(ProtocolTypes.PRICE_DIGIT));
    }

    function _getTotalPresentValue(bytes32 _ccy, address _user)
        internal
        view
        returns (int256 totalPresentValue)
    {
        // Get PV from Future Value Vault
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            address marketAddr = Storage.slot().lendingMarkets[_ccy][i];
            (int256 futureValueInMaturity, uint256 maturity) = IFutureValueVault(
                Storage.slot().futureValueVaults[_ccy][marketAddr]
            ).getFutureValue(_user);

            totalPresentValue += _calculatePVFromFVInMaturity(
                _ccy,
                maturity,
                futureValueInMaturity,
                Storage.slot().lendingMarkets[_ccy][i]
            );
        }

        // Get PV from Genesis Value Vault
        totalPresentValue += _calculatePVFromFV(
            AddressResolverLib.genesisValueVault().getGenesisValueInFutureValue(_ccy, _user),
            ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice()
        );
    }

    function _calculateLentFundsFromOrders(
        bytes32 _ccy,
        address _market,
        address _user
    )
        internal
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 claimableAmount,
            uint256 lentAmount
        )
    {
        (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValueInMaturity,
            uint256 maturity
        ) = ILendingMarket(_market).getTotalAmountFromLendOrders(_user);

        workingOrdersAmount = activeAmount;
        claimableAmount = uint256(
            _calculatePVFromFVInMaturity(
                _ccy,
                maturity,
                int256(inactiveFutureValueInMaturity),
                _market
            )
        );
        lentAmount = inactiveAmount;
    }

    function _calculateBorrowedFundsFromOrders(
        bytes32 _ccy,
        address _market,
        address _user
    )
        internal
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        (
            uint256 activeAmount,
            uint256 inactiveAmount,
            uint256 inactiveFutureValueInMaturity,
            uint256 maturity
        ) = ILendingMarket(_market).getTotalAmountFromBorrowOrders(_user);

        workingOrdersAmount = activeAmount;
        debtAmount = uint256(
            _calculatePVFromFVInMaturity(
                _ccy,
                maturity,
                int256(inactiveFutureValueInMaturity),
                _market
            )
        );
        borrowedAmount = inactiveAmount;
    }

    function _offsetFutureValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _lender,
        address _borrower,
        uint256 _maximumFVAmount
    ) internal returns (uint256 offsetAmount) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];
        address futureValueVault = Storage.slot().futureValueVaults[_ccy][market];

        (int256 lenderFVAmount, uint256 lenderMaturity) = IFutureValueVault(futureValueVault)
            .getFutureValue(_lender);
        (int256 borrowerFVAmount, uint256 borrowerMaturity) = IFutureValueVault(futureValueVault)
            .getFutureValue(_borrower);

        if (lenderFVAmount <= 0 || borrowerFVAmount >= 0) {
            return 0;
        }

        if (lenderMaturity == borrowerMaturity) {
            offsetAmount = uint256(lenderFVAmount);

            if (-borrowerFVAmount < lenderFVAmount) {
                offsetAmount = uint256(-borrowerFVAmount);
            }

            if (_maximumFVAmount != 0 && offsetAmount > _maximumFVAmount) {
                offsetAmount = _maximumFVAmount;
            }

            IFutureValueVault(futureValueVault).offsetFutureValue(
                _lender,
                _borrower,
                offsetAmount,
                lenderMaturity
            );
        }
    }

    function _offsetGenesisValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _lender,
        address _borrower,
        uint256 _maximumGVAmount
    ) internal returns (uint256 offsetAmount) {
        int256 lenderGVAmount = AddressResolverLib.genesisValueVault().getGenesisValue(
            _ccy,
            _lender
        );
        int256 borrowerGVAmount = AddressResolverLib.genesisValueVault().getGenesisValue(
            _ccy,
            _borrower
        );

        if (lenderGVAmount <= 0 || borrowerGVAmount >= 0) {
            return 0;
        } else {
            offsetAmount = uint256(lenderGVAmount);
        }

        if (-borrowerGVAmount < lenderGVAmount) {
            offsetAmount = uint256(-borrowerGVAmount);
        }

        if (_maximumGVAmount != 0 && offsetAmount > _maximumGVAmount) {
            offsetAmount = _maximumGVAmount;
        }

        AddressResolverLib.genesisValueVault().addBorrowGenesisValue(
            _ccy,
            _lender,
            _maturity,
            offsetAmount
        );
        AddressResolverLib.genesisValueVault().addLendGenesisValue(
            _ccy,
            _borrower,
            _maturity,
            offsetAmount
        );
    }
}
