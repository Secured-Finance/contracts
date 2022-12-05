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

    function convertToLiquidationAmountFromCollateral(
        bytes32 _collateralCcy,
        bytes32 _debtCcy,
        uint256 _debtMaturity,
        address _user
    ) public returns (uint256 liquidationPVAmount, uint256 debtFVAmount) {
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

        debtFVAmount = uint256(-futureValueAmount);
        uint256 debtPVAmount = uint256(
            _calculatePVFromFVInMaturity(
                _debtCcy,
                _debtMaturity,
                -futureValueAmount,
                Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity]
            )
        );

        // uint256 debtPVAmount = futureValueAmount >= 0
        //     ? 0
        //     : uint256(
        //         _calculatePVFromFVInMaturity(
        //             _debtCcy,
        //             _debtMaturity,
        //             -futureValueAmount,
        //             Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity]
        //         )
        //     );

        liquidationPVAmount = AddressResolverLib.currencyController().convertFromETH(
            _debtCcy,
            liquidationPVAmountInETH
        );
        // uint256 liquidationPVAmount = AddressResolverLib.currencyController().convertFromETH(
        //     _debtCcy,
        //     liquidationPVAmountInETH
        // );

        liquidationPVAmount = liquidationPVAmount > debtPVAmount
            ? debtPVAmount
            : liquidationPVAmount;

        // Swap collateral from deposited currency to debt currency using Uniswap.
        AddressResolverLib.tokenVault().swapCollateral(
            _user,
            _collateralCcy,
            _debtCcy,
            depositAmount,
            liquidationPVAmount
        );

        // liquidationFVAmount =
        //     (liquidationPVAmount * ProtocolTypes.PRICE_DIGIT) /
        //     ILendingMarket(Storage.slot().maturityLendingMarkets[_debtCcy][_debtMaturity])
        //         .getMidUnitPrice();
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

    function getPresentValue(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (int256 presentValue, uint256 maturity) {
        address market = Storage.slot().maturityLendingMarkets[_ccy][_maturity];

        // Get PV from Future Value Vault
        int256 futureValueInMaturity;
        (futureValueInMaturity, maturity) = IFutureValueVault(
            Storage.slot().futureValueVaults[_ccy][market]
        ).getFutureValue(_user);

        presentValue = _calculatePVFromFVInMaturity(_ccy, maturity, futureValueInMaturity, market);

        // Add PV from Genesis Value Vault if the market is nearest market.
        if (market == Storage.slot().lendingMarkets[_ccy][0]) {
            int256 amountInFV = AddressResolverLib.genesisValueVault().getGenesisValueInFutureValue(
                _ccy,
                _user
            );
            presentValue += _calculatePVFromFV(
                amountInFV,
                ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice()
            );
        }
    }

    function getTotalPresentValue(bytes32 _ccy, address _user)
        public
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
        int256 amountInFV = AddressResolverLib.genesisValueVault().getGenesisValueInFutureValue(
            _ccy,
            _user
        );
        totalPresentValue += _calculatePVFromFV(
            amountInFV,
            ILendingMarket(Storage.slot().lendingMarkets[_ccy][0]).getMidUnitPrice()
        );
    }

    function calculateLentFundsFromOrders(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 claimableAmount,
            uint256 lentAmount
        )
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 activeAmount,
                uint256 inactiveAmount,
                uint256 inactiveFutureValueInMaturity,
                uint256 maturity
            ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i]).getTotalAmountFromLendOrders(
                        _user
                    );

            workingOrdersAmount += activeAmount;
            claimableAmount += uint256(
                _calculatePVFromFVInMaturity(
                    _ccy,
                    maturity,
                    int256(inactiveFutureValueInMaturity),
                    Storage.slot().lendingMarkets[_ccy][i]
                )
            );
            lentAmount += inactiveAmount;
        }
    }

    function calculateBorrowedFundsFromOrders(bytes32 _ccy, address _user)
        public
        view
        returns (
            uint256 workingOrdersAmount,
            uint256 debtAmount,
            uint256 borrowedAmount
        )
    {
        for (uint256 i = 0; i < Storage.slot().lendingMarkets[_ccy].length; i++) {
            (
                uint256 activeAmount,
                uint256 inactiveAmount,
                uint256 inactiveFutureValueInMaturity,
                uint256 maturity
            ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy][i])
                    .getTotalAmountFromBorrowOrders(_user);

            workingOrdersAmount += activeAmount;
            debtAmount += uint256(
                _calculatePVFromFVInMaturity(
                    _ccy,
                    maturity,
                    int256(inactiveFutureValueInMaturity),
                    Storage.slot().lendingMarkets[_ccy][i]
                )
            );
            borrowedAmount += inactiveAmount;
        }
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
        int256 totalPresentValue = getTotalPresentValue(_ccy, _user);
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
            totalLentAmount += amountsInETH[3];

            totalWorkingBorrowOrdersAmount += amountsInETH[4];
            totalDebtAmount += amountsInETH[5];
            totalBorrowedAmount += amountsInETH[6];
        }
    }

    function _calculatePVFromFVInMaturity(
        bytes32 _ccy,
        uint256 maturity,
        int256 futureValueInMaturity,
        address lendingMarketInMaturity
    ) private view returns (int256 totalPresentValue) {
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
}
