// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// interfaces
import {ILendingMarket} from "../interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "../interfaces/IFutureValueVault.sol";
// libraries
import {AddressResolverLib} from "./AddressResolverLib.sol";
// types
import {ProtocolTypes} from "../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../storages/LendingMarketControllerStorage.sol";

library FundCalculationLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    struct CalculatedAmountVars {
        uint256 debtFVAmount;
        uint256 debtPVAmount;
        uint256 estimatedDebtPVAmount;
        uint256 liquidationPVAmount;
    }

    function convertToLiquidationAmountFromCollateral(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user,
        uint24 _poolFee
    ) public returns (uint256) {
        CalculatedAmountVars memory vars;

        uint256 liquidationPVAmountInETH = AddressResolverLib.tokenVault().getLiquidationAmount(
            _user
        );
        require(liquidationPVAmountInETH != 0, "User has enough collateral");

        uint256 depositAmount = AddressResolverLib.tokenVault().getDepositAmount(
            _user,
            _collateralCcy
        );
        require(depositAmount != 0, "No collateral in the selected currency");

        (int256 futureValueAmount, uint256 fvMaturity) = getFutureValue(
            _debtCcy,
            _debtMaturity,
            _user
        );
        require(futureValueAmount < 0, "No debt in the selected maturity");
        require(fvMaturity == _debtMaturity, "Need to clear orders first");

        vars.debtFVAmount = uint256(-futureValueAmount);
        vars.debtPVAmount = uint256(
            _calculatePVFromFVInMaturity(
                _debtCcy,
                _debtMaturity,
                -futureValueAmount,
                Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity]
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

        // Swap collateral from deposited currency to debt currency using Uniswap.
        // This swapped collateral is used to unwind the debt.
        AddressResolverLib.tokenVault().swapCollateral(
            _user,
            _collateralCcy,
            _debtCcy,
            depositAmount,
            vars.liquidationPVAmount,
            _poolFee
        );

        // Estimate the filled amount from actual orders in the order book using the future value of user debt.
        // If the estimated amount is less than the liquidation amount, the estimated amount is used as
        // the liquidation amount because the user has only the original amount of the estimation as collateral.
        vars.estimatedDebtPVAmount = ILendingMarket(
            Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity]
        ).estimateFilledAmount(ProtocolTypes.Side.LEND, vars.debtFVAmount);

        return
            vars.liquidationPVAmount > vars.estimatedDebtPVAmount
                ? vars.estimatedDebtPVAmount
                : vars.liquidationPVAmount;
    }

    function getFutureValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (int256 amount, uint256 maturity) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];

        (amount, maturity) = IFutureValueVault(Storage.slot().futureValueVaults[_ccy][market])
            .getFutureValue(_user);

        // Add PV from Genesis Value Vault if the market is nearest market.
        if (market == Storage.slot().lendingMarkets[_ccy][0]) {
            amount += AddressResolverLib.genesisValueVault().getGenesisValueInFutureValue(
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
            uint256 haircut = AddressResolverLib.currencyController().getHaircut(_ccy);
            collateralAmount += (uint256(totalPresentValue) * haircut) / ProtocolTypes.PCT_DIGIT;
        } else {
            // Add to debtAmount
            debtAmount += uint256(-totalPresentValue);
        }
    }

    function calculateTotalFundsInETH(address _user)
        external
        view
        returns (
            uint256 totalWorkingLendOrdersAmount,
            uint256 totalClaimableAmount,
            uint256 totalCollateralAmount,
            uint256 totalLentAmount,
            uint256 totalWorkingBorrowOrdersAmount,
            uint256 totalDebtAmount,
            uint256 totalBorrowedAmount
        )
    {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];
        bool[] memory isCollateral = AddressResolverLib.tokenVault().isCollateral(
            currencySet.values()
        );

        // Calculate total funds from the user's order list
        for (uint256 i = 0; i < currencySet.length(); i++) {
            bytes32 ccy = currencySet.at(i);
            uint256[] memory amounts = new uint256[](7);

            // 0: workingLendOrdersAmount
            // 1: claimableAmount
            // 2: collateralAmount
            // 3: lentAmount
            // 4: workingBorrowOrdersAmount
            // 5: debtAmount
            // 6: borrowedAmount
            (
                amounts[0],
                amounts[1],
                amounts[2],
                amounts[3],
                amounts[4],
                amounts[5],
                amounts[6]
            ) = calculateFunds(ccy, _user);

            uint256[] memory amountsInETH = AddressResolverLib.currencyController().convertToETH(
                ccy,
                amounts
            );

            totalWorkingLendOrdersAmount += amountsInETH[0];
            totalClaimableAmount += amountsInETH[1];
            totalCollateralAmount += amountsInETH[2];
            totalWorkingBorrowOrdersAmount += amountsInETH[4];
            totalDebtAmount += amountsInETH[5];

            if (isCollateral[i]) {
                totalLentAmount += amountsInETH[3];
                totalBorrowedAmount += amountsInETH[6];
            }
        }
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
            int256 genesisValue = AddressResolverLib.genesisValueVault().calculateGVFromFV(
                _ccy,
                maturity,
                futureValueInMaturity
            );
            futureValue = AddressResolverLib.genesisValueVault().calculateFVFromGV(
                _ccy,
                0,
                genesisValue
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
        // NOTE: The formula is: futureValue = presentValue / unitPrice.
        return (_futureValue * int256(_unitPrice)) / int256(ProtocolTypes.PRICE_DIGIT);
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
}
