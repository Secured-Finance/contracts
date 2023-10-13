// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// dependencies
import {EnumerableSet} from "../../../dependencies/openzeppelin/utils/structs/EnumerableSet.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
import {ILiquidationReceiver} from "../../interfaces/ILiquidationReceiver.sol";

// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {QuickSort} from "../QuickSort.sol";
import {Constants} from "../Constants.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {RoundingInt256} from "../math/RoundingInt256.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage} from "../../storages/LendingMarketControllerStorage.sol";

library FundManagementLogic {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeCast for uint256;
    using SafeCast for int256;
    using RoundingUint256 for uint256;
    using RoundingInt256 for int256;

    uint256 public constant BASE_MIN_DEBT_UNIT_PRICE = 9600;

    error NotRedemptionPeriod();
    error NotRepaymentPeriod();
    error NoRedemptionAmount();
    error NoRepaymentAmount();
    error AlreadyRedeemed();
    error InsufficientCollateral();

    struct CalculatedTotalFundInBaseCurrencyVars {
        address user;
        ILendingMarketController.AdditionalFunds additionalFunds;
        uint256 liquidationThresholdRate;
        bool[] isCollateral;
        bytes32[] ccys;
    }

    struct ActualFunds {
        int256 presentValue;
        uint256 claimableAmount;
        uint256 debtAmount;
        int256 futureValue;
        uint256 workingLendOrdersAmount;
        uint256 lentAmount;
        uint256 workingBorrowOrdersAmount;
        uint256 borrowedAmount;
        int256 genesisValue;
    }

    struct CalculateActualFundsVars {
        bool isTotal;
        bool isDefaultMarket;
        uint8 orderBookId;
        uint8 defaultOrderBookId;
        uint256 defaultOrderBookMarketUnitPrice;
        uint256[] maturities;
        int256 presentValueOfDefaultMarket;
        ILendingMarket market;
        IFutureValueVault futureValueVault;
        uint256 minDebtUnitPrice;
        uint256 defaultOrderBookMinDebtUnitPrice;
    }

    struct FutureValueVaultFunds {
        int256 genesisValue;
        int256 presentValue;
        int256 futureValue;
    }

    struct InactiveBorrowOrdersFunds {
        int256 genesisValue;
        int256 presentValue;
        int256 futureValue;
        uint256 workingOrdersAmount;
        uint256 borrowedAmount;
    }

    struct InactiveLendOrdersFunds {
        int256 genesisValue;
        int256 presentValue;
        int256 futureValue;
        uint256 workingOrdersAmount;
        uint256 lentAmount;
    }

    event OrderFilled(
        address indexed taker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 indexed maturity,
        uint256 amount,
        uint256 amountInFV,
        uint256 feeInFV
    );

    event OrdersFilledInAsync(
        address indexed taker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 indexed maturity,
        uint256 amount,
        uint256 amountInFV
    );

    event OrderPartiallyFilled(
        uint48 orderId,
        address indexed maker,
        bytes32 indexed ccy,
        ProtocolTypes.Side side,
        uint256 maturity,
        uint256 amount,
        uint256 amountInFV
    );

    event RedemptionExecuted(
        address indexed user,
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 amount
    );

    event RepaymentExecuted(
        address indexed user,
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 amount
    );

    event EmergencySettlementExecuted(address indexed user, uint256 amount);

    /**
     * @notice Converts the future value to the genesis value if there is balance in the past maturity.
     * @param _ccy Currency for pausing all lending markets
     * @param _user User's address
     * @return Current future value amount after update
     */
    function convertFutureValueToGenesisValue(
        bytes32 _ccy,
        uint8 _orderBookId,
        uint256 _maturity,
        address _user
    ) public returns (int256) {
        address futureValueVault = Storage.slot().futureValueVaults[_ccy];
        (
            int256 removedAmount,
            int256 currentAmount,
            uint256 basisMaturity,
            bool isAllRemoved
        ) = IFutureValueVault(futureValueVault).reset(_orderBookId, _user, _maturity);

        if (removedAmount != 0) {
            // Overwrite the `removedAmount` with the unsettled amount left of the Genesis Value
            // to handle the fractional amount generated by the lazy evaluation.
            if (isAllRemoved) {
                AddressResolverLib.genesisValueVault().updateGenesisValueWithResidualAmount(
                    _ccy,
                    _user,
                    basisMaturity
                );
            } else {
                AddressResolverLib.genesisValueVault().updateGenesisValueWithFutureValue(
                    _ccy,
                    _user,
                    basisMaturity,
                    removedAmount
                );
            }
        }

        return currentAmount;
    }

    function updateFunds(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        ProtocolTypes.Side _side,
        uint256 _filledAmount,
        uint256 _filledAmountInFV,
        uint256 _feeInFV,
        bool _isTaker
    ) external {
        address futureValueVault = Storage.slot().futureValueVaults[_ccy];
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];

        if (_side == ProtocolTypes.Side.BORROW) {
            AddressResolverLib.tokenVault().addDepositAmount(_user, _ccy, _filledAmount);
            IFutureValueVault(futureValueVault).decrease(
                orderBookId,
                _user,
                _filledAmountInFV + _feeInFV,
                _maturity,
                _isTaker
            );
        } else {
            AddressResolverLib.tokenVault().removeDepositAmount(_user, _ccy, _filledAmount);
            IFutureValueVault(futureValueVault).increase(
                orderBookId,
                _user,
                _filledAmountInFV - _feeInFV,
                _maturity,
                _isTaker
            );
        }

        if (_feeInFV > 0) {
            address reserveFundAddr = address(AddressResolverLib.reserveFund());
            IFutureValueVault(futureValueVault).increase(
                orderBookId,
                reserveFundAddr,
                _feeInFV,
                _maturity,
                _side == ProtocolTypes.Side.LEND
            );

            registerCurrencyAndMaturity(_ccy, _maturity, reserveFundAddr);
        }
    }

    function registerCurrencyAndMaturity(bytes32 _ccy, uint256 _maturity, address _user) public {
        if (!Storage.slot().usedMaturities[_ccy][_user].contains(_maturity)) {
            Storage.slot().usedMaturities[_ccy][_user].add(_maturity);

            registerCurrency(_ccy, _user);
        }
    }

    function registerCurrency(bytes32 _ccy, address _user) public {
        if (!Storage.slot().usedCurrencies[_user].contains(_ccy)) {
            Storage.slot().usedCurrencies[_user].add(_ccy);
        }
    }

    function executeRedemption(bytes32 _ccy, uint256 _maturity, address _user) external {
        if (
            AddressResolverLib.currencyController().currencyExists(_ccy) ||
            block.timestamp < _maturity + 1 weeks
        ) revert NotRedemptionPeriod();

        cleanUpFunds(_ccy, _user);

        int256 amount = getActualFunds(_ccy, _maturity, _user, 0).futureValue;
        if (amount <= 0) revert NoRedemptionAmount();

        uint256 redemptionAmount = _resetFundsPerMaturity(_ccy, _maturity, _user, amount)
            .toUint256();
        AddressResolverLib.tokenVault().addDepositAmount(_user, _ccy, redemptionAmount);

        emit RedemptionExecuted(_user, _ccy, _maturity, redemptionAmount);
    }

    function executeRepayment(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _amount
    ) public returns (uint256 repaymentAmount) {
        if (
            AddressResolverLib.currencyController().currencyExists(_ccy) ||
            block.timestamp < _maturity
        ) revert NotRepaymentPeriod();

        cleanUpFunds(_ccy, _user);

        int256 resetAmount = _amount == 0
            ? getActualFunds(_ccy, _maturity, _user, 0).futureValue
            : -_amount.toInt256();

        if (resetAmount >= 0) revert NoRepaymentAmount();

        repaymentAmount = (-_resetFundsPerMaturity(_ccy, _maturity, _user, resetAmount))
            .toUint256();
        AddressResolverLib.tokenVault().removeDepositAmount(_user, _ccy, repaymentAmount);

        emit RepaymentExecuted(_user, _ccy, _maturity, repaymentAmount);
    }

    function executeEmergencySettlement(address _user) external {
        if (Storage.slot().isRedeemed[_user]) revert AlreadyRedeemed();

        int256 redemptionAmountInBaseCurrency;

        bytes32[] memory currencies = Storage.slot().usedCurrencies[_user].values();

        for (uint256 i; i < currencies.length; i++) {
            bytes32 ccy = currencies[i];
            // First, clean up future values and genesis values to redeem those amounts.
            cleanUpFunds(ccy, _user);

            int256 amountInCcy = _resetFundsPerCurrency(ccy, _user);
            redemptionAmountInBaseCurrency += _convertToBaseCurrencyAtMarketTerminationPrice(
                ccy,
                amountInCcy
            );
        }

        bytes32[] memory collateralCurrencies = AddressResolverLib
            .tokenVault()
            .getCollateralCurrencies();

        for (uint256 i; i < collateralCurrencies.length; i++) {
            int256 amountInCcy = AddressResolverLib
                .tokenVault()
                .executeForcedReset(_user, collateralCurrencies[i])
                .toInt256();

            redemptionAmountInBaseCurrency += _convertToBaseCurrencyAtMarketTerminationPrice(
                collateralCurrencies[i],
                amountInCcy
            );
        }

        if (redemptionAmountInBaseCurrency > 0) {
            uint256[] memory marketTerminationRatios = new uint256[](collateralCurrencies.length);
            uint256 marketTerminationRatioTotal;

            for (uint256 i; i < collateralCurrencies.length; i++) {
                bytes32 ccy = collateralCurrencies[i];
                marketTerminationRatios[i] = Storage.slot().marketTerminationRatios[ccy];
                marketTerminationRatioTotal += marketTerminationRatios[i];
            }

            for (uint256 i; i < collateralCurrencies.length; i++) {
                bytes32 ccy = collateralCurrencies[i];
                uint256 addedAmount = _convertFromBaseCurrencyAtMarketTerminationPrice(
                    ccy,
                    (redemptionAmountInBaseCurrency.toUint256() * marketTerminationRatios[i]).div(
                        marketTerminationRatioTotal
                    )
                );

                AddressResolverLib.tokenVault().addDepositAmount(_user, ccy, addedAmount);
            }
        } else if (redemptionAmountInBaseCurrency < 0) {
            revert InsufficientCollateral();
        }

        Storage.slot().isRedeemed[_user] = true;
        emit EmergencySettlementExecuted(_user, redemptionAmountInBaseCurrency.toUint256());
    }

    function getActualFunds(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        uint256 _minDebtUnitPrice
    ) public view returns (ActualFunds memory actualFunds) {
        CalculateActualFundsVars memory vars;
        vars.market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        vars.futureValueVault = IFutureValueVault(Storage.slot().futureValueVaults[_ccy]);
        vars.defaultOrderBookId = Storage.slot().orderBookIdLists[_ccy][0];
        vars.minDebtUnitPrice = _minDebtUnitPrice;

        if (_maturity == 0) {
            vars.isTotal = true;
            vars.orderBookId = vars.defaultOrderBookId;
            vars.isDefaultMarket = true;
        } else {
            vars.isTotal = false;
            vars.orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];
            vars.isDefaultMarket = vars.orderBookId == vars.defaultOrderBookId;
        }
        actualFunds.genesisValue = AddressResolverLib.genesisValueVault().getBalance(_ccy, _user);

        vars.maturities = getUsedMaturities(_ccy, _user);

        for (uint256 i; i < vars.maturities.length; i++) {
            uint8 currentOrderBookId = Storage.slot().maturityOrderBookIds[_ccy][
                vars.maturities[i]
            ];

            if (vars.isDefaultMarket || currentOrderBookId == vars.orderBookId) {
                {
                    uint256 currentMaturity = vars.market.getMaturity(currentOrderBookId);
                    bool isDefaultMarket = currentOrderBookId == vars.defaultOrderBookId;

                    // Get current funds from Future Value Vault by lazy evaluations.
                    FutureValueVaultFunds
                        memory futureValueVaultFunds = _getFundsFromFutureValueVault(
                            _ccy,
                            _user,
                            vars,
                            currentOrderBookId,
                            currentMaturity,
                            isDefaultMarket
                        );
                    // Get current funds from borrowing orders by lazy evaluations.
                    InactiveBorrowOrdersFunds
                        memory borrowOrdersFunds = _getFundsFromInactiveBorrowOrders(
                            _ccy,
                            _user,
                            vars,
                            currentOrderBookId,
                            currentMaturity,
                            isDefaultMarket
                        );
                    // Get current funds from lending orders by lazy evaluations.
                    InactiveLendOrdersFunds
                        memory lendOrdersFunds = _getFundsFromInactiveLendOrders(
                            _ccy,
                            _user,
                            vars,
                            currentOrderBookId,
                            currentMaturity,
                            isDefaultMarket
                        );

                    // Set genesis value.
                    actualFunds.genesisValue +=
                        futureValueVaultFunds.genesisValue -
                        borrowOrdersFunds.genesisValue +
                        lendOrdersFunds.genesisValue;

                    // Set present value.
                    int256 presentValue = futureValueVaultFunds.presentValue -
                        borrowOrdersFunds.presentValue +
                        lendOrdersFunds.presentValue;
                    int256 futureValue = futureValueVaultFunds.futureValue -
                        borrowOrdersFunds.futureValue +
                        lendOrdersFunds.futureValue;

                    actualFunds.presentValue += presentValue;

                    if (isDefaultMarket) {
                        vars.presentValueOfDefaultMarket = presentValue;
                    }

                    if (presentValue > 0) {
                        actualFunds.claimableAmount += presentValue.toUint256();
                    } else if (presentValue < 0) {
                        actualFunds.debtAmount += (-presentValue).toUint256();
                    }

                    // Set future value.
                    // Note: When calculating total funds, total future value will be 0 because different maturities can not be added.
                    if (!vars.isTotal) {
                        actualFunds.futureValue += futureValue;
                    }

                    actualFunds.workingBorrowOrdersAmount += borrowOrdersFunds.workingOrdersAmount;
                    actualFunds.workingLendOrdersAmount += lendOrdersFunds.workingOrdersAmount;
                    actualFunds.borrowedAmount += borrowOrdersFunds.borrowedAmount;
                    actualFunds.lentAmount += lendOrdersFunds.lentAmount;
                }

                // Get balance fluctuation amount by auto-rolls
                if (actualFunds.genesisValue < 0) {
                    actualFunds.genesisValue += AddressResolverLib
                        .genesisValueVault()
                        .calculateBalanceFluctuationByAutoRolls(
                            _ccy,
                            actualFunds.genesisValue,
                            vars.maturities[i],
                            i == vars.maturities.length - 1 ? 0 : vars.maturities[i + 1]
                        );
                }
            }
        }

        // Add GV to PV & FV if the market is that the lending position is rolled to.
        if (vars.isDefaultMarket && actualFunds.genesisValue != 0) {
            int256 futureValue = AddressResolverLib.genesisValueVault().calculateFVFromGV(
                _ccy,
                0,
                actualFunds.genesisValue
            );

            uint256 unitPrice = _getDefaultOrderBookMarketUnitPrice(vars);
            uint256 defaultOrderBookMinDebtUnitPrice = _getDefaultOrderBookMinDebtUnitPrice(vars);

            int256 presentValue = _calculatePVFromFV(
                futureValue,
                unitPrice >= defaultOrderBookMinDebtUnitPrice
                    ? unitPrice
                    : defaultOrderBookMinDebtUnitPrice
            );

            actualFunds.presentValue += presentValue;

            // Add GV to the claimable amount or debt amount.
            // Before that, offset the present value of the default market and the genesis value in addition.
            if (presentValue > 0) {
                if (vars.presentValueOfDefaultMarket < 0) {
                    int256 offsetAmount = presentValue > -vars.presentValueOfDefaultMarket
                        ? -vars.presentValueOfDefaultMarket
                        : presentValue;
                    actualFunds.debtAmount -= (offsetAmount).toUint256();
                    presentValue -= offsetAmount;
                }

                actualFunds.claimableAmount += presentValue.toUint256();
            } else if (presentValue < 0) {
                if (vars.presentValueOfDefaultMarket > 0) {
                    int256 offsetAmount = -presentValue > vars.presentValueOfDefaultMarket
                        ? vars.presentValueOfDefaultMarket
                        : -presentValue;

                    actualFunds.claimableAmount -= (offsetAmount).toUint256();
                    presentValue += offsetAmount;
                }

                actualFunds.debtAmount += (-presentValue).toUint256();
            }

            if (!vars.isTotal) {
                actualFunds.futureValue += futureValue;
            }
        }
    }

    function getCurrentMinDebtUnitPrice(
        uint256 _maturity,
        uint256 _minDebtUnitPrice
    ) public view returns (uint256) {
        if (_minDebtUnitPrice == 0) return 0;

        return
            _maturity > block.timestamp
                ? BASE_MIN_DEBT_UNIT_PRICE -
                    ((BASE_MIN_DEBT_UNIT_PRICE - _minDebtUnitPrice) *
                        (_maturity - block.timestamp)) /
                    Constants.SECONDS_IN_YEAR
                : BASE_MIN_DEBT_UNIT_PRICE;
    }

    function calculateFunds(
        bytes32 _ccy,
        address _user,
        ILendingMarketController.AdditionalFunds memory _additionalFunds,
        uint256 _liquidationThresholdRate
    ) public view returns (ILendingMarketController.CalculatedFunds memory funds) {
        ActualFunds memory actualFunds = getActualFunds(
            _ccy,
            0,
            _user,
            Storage.slot().minDebtUnitPrices[_ccy]
        );

        funds.workingLendOrdersAmount =
            actualFunds.workingLendOrdersAmount +
            _additionalFunds.workingLendOrdersAmount;
        funds.claimableAmount = actualFunds.claimableAmount + _additionalFunds.claimableAmount;
        funds.lentAmount = actualFunds.lentAmount + _additionalFunds.lentAmount;
        funds.workingBorrowOrdersAmount =
            actualFunds.workingBorrowOrdersAmount +
            _additionalFunds.workingBorrowOrdersAmount;
        funds.debtAmount = actualFunds.debtAmount + _additionalFunds.debtAmount;
        funds.borrowedAmount = actualFunds.borrowedAmount + _additionalFunds.borrowedAmount;

        if (funds.claimableAmount > 0) {
            // If the debt and claimable amount are in the same currency, the claimable amount can be allocated
            // as collateral up to the amount that the liquidation threshold is reached.
            // For calculation purposes, the working amount for borrowing orders is treated as potential debt in addition.
            uint256 maxAllocableCollateralAmountInSameCcy = ((funds.debtAmount +
                funds.workingBorrowOrdersAmount) * _liquidationThresholdRate).div(
                    Constants.PCT_DIGIT
                );

            // If the claimable amount is over the allocable amount as collateral, the over amount is used as collateral
            // for the other currency after being multiplied by a haircut.
            if (funds.claimableAmount > maxAllocableCollateralAmountInSameCcy) {
                uint256 haircut = AddressResolverLib.currencyController().getHaircut(_ccy);
                funds.collateralAmount =
                    maxAllocableCollateralAmountInSameCcy +
                    (haircut * (funds.claimableAmount - maxAllocableCollateralAmountInSameCcy)).div(
                        Constants.PCT_DIGIT
                    );
            } else {
                funds.collateralAmount = funds.claimableAmount;
            }
        }
    }

    function calculateTotalFundsInBaseCurrency(
        address _user,
        ILendingMarketController.AdditionalFunds calldata _additionalFunds,
        uint256 _liquidationThresholdRate
    ) external view returns (ILendingMarketController.CalculatedTotalFunds memory totalFunds) {
        EnumerableSet.Bytes32Set storage currencySet = Storage.slot().usedCurrencies[_user];
        CalculatedTotalFundInBaseCurrencyVars memory vars;

        if (
            !currencySet.contains(_additionalFunds.ccy) &&
            AddressResolverLib.currencyController().currencyExists(_additionalFunds.ccy)
        ) {
            uint256 length = currencySet.length();
            vars.ccys = new bytes32[](length + 1);
            for (uint256 i; i < length; i++) {
                vars.ccys[i] = currencySet.at(i);
            }
            vars.ccys[length] = _additionalFunds.ccy;
        } else {
            vars.ccys = currencySet.values();
        }

        vars.user = _user;
        vars.additionalFunds = _additionalFunds;
        vars.liquidationThresholdRate = _liquidationThresholdRate;
        vars.isCollateral = AddressResolverLib.tokenVault().isCollateral(vars.ccys);

        // Calculate total funds from the user's order list
        for (uint256 i; i < vars.ccys.length; i++) {
            // bytes32 ccy = vars.ccys[i];
            ILendingMarketController.AdditionalFunds memory additionalFunds;

            if (vars.ccys[i] == vars.additionalFunds.ccy) {
                additionalFunds = vars.additionalFunds;
            }

            uint256[] memory amounts = new uint256[](8);

            // 0: workingLendOrdersAmount
            // 1: claimableAmount
            // 2: collateralAmount
            // 3: lentAmount
            // 4: workingBorrowOrdersAmount
            // 5: debtAmount
            // 6: borrowedAmount
            ILendingMarketController.CalculatedFunds memory funds = calculateFunds(
                vars.ccys[i],
                vars.user,
                additionalFunds,
                vars.liquidationThresholdRate
            );

            amounts[0] = funds.workingLendOrdersAmount;
            amounts[1] = funds.claimableAmount;
            amounts[2] = funds.collateralAmount;
            amounts[3] = funds.lentAmount;
            amounts[4] = funds.workingBorrowOrdersAmount;
            amounts[5] = funds.debtAmount;
            amounts[6] = funds.borrowedAmount;

            if (vars.ccys[i] == vars.additionalFunds.ccy) {
                // plusDepositAmount: borrowedAmount
                // minusDepositAmount: workingLendOrdersAmount + lentAmount
                totalFunds.plusDepositAmountInAdditionalFundsCcy += amounts[6];
                totalFunds.minusDepositAmountInAdditionalFundsCcy += amounts[0] + amounts[3];
            }

            uint256[] memory amountsInBaseCurrency = AddressResolverLib
                .currencyController()
                .convertToBaseCurrency(vars.ccys[i], amounts);

            totalFunds.claimableAmount += amountsInBaseCurrency[1];
            totalFunds.collateralAmount += amountsInBaseCurrency[2];
            totalFunds.workingBorrowOrdersAmount += amountsInBaseCurrency[4];
            totalFunds.debtAmount += amountsInBaseCurrency[5];

            // NOTE: Lent amount and working lend orders amount are excluded here as they are not used
            // for the collateral calculation.
            // Those amounts need only to check whether there is enough deposit amount in the selected currency.
            if (vars.isCollateral[i]) {
                totalFunds.workingLendOrdersAmount += amountsInBaseCurrency[0];
                totalFunds.lentAmount += amountsInBaseCurrency[3];
                totalFunds.borrowedAmount += amountsInBaseCurrency[6];
            }
        }
    }

    function getUsedMaturities(
        bytes32 _ccy,
        address _user
    ) public view returns (uint256[] memory maturities) {
        maturities = Storage.slot().usedMaturities[_ccy][_user].values();
        if (maturities.length > 0) {
            maturities = QuickSort.sort(maturities);
        }
    }

    function getPosition(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) public view returns (int256 presentValue, int256 futureValue) {
        FundManagementLogic.ActualFunds memory funds = getActualFunds(_ccy, _maturity, _user, 0);
        presentValue = funds.presentValue;
        futureValue = funds.futureValue;
    }

    function cleanUpAllFunds(address _user) external {
        EnumerableSet.Bytes32Set storage ccySet = Storage.slot().usedCurrencies[_user];
        uint256 length = ccySet.length();
        for (uint256 i; i < length; i++) {
            cleanUpFunds(ccySet.at(i), _user);
        }
    }

    function cleanUpFunds(
        bytes32 _ccy,
        address _user
    ) public returns (uint256 totalActiveOrderCount) {
        bool futureValueExists = false;
        uint256[] memory maturities = getUsedMaturities(_ccy, _user);
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);

        for (uint256 i; i < maturities.length; i++) {
            uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][maturities[i]];
            uint256 activeMaturity = market.getMaturity(orderBookId);
            int256 currentFutureValue = convertFutureValueToGenesisValue(
                _ccy,
                orderBookId,
                activeMaturity,
                _user
            );
            (uint256 activeOrderCount, bool isCleaned) = _cleanUpOrders(
                _ccy,
                activeMaturity,
                _user
            );

            totalActiveOrderCount += activeOrderCount;

            if (isCleaned) {
                currentFutureValue = convertFutureValueToGenesisValue(
                    _ccy,
                    orderBookId,
                    activeMaturity,
                    _user
                );
            }

            if (currentFutureValue != 0) {
                futureValueExists = true;
            }

            if (currentFutureValue == 0 && activeOrderCount == 0) {
                Storage.slot().usedMaturities[_ccy][_user].remove(maturities[i]);
            }

            AddressResolverLib.genesisValueVault().cleanUpBalance(
                _ccy,
                _user,
                i == maturities.length - 1 ? 0 : maturities[i + 1]
            );
        }

        if (
            totalActiveOrderCount == 0 &&
            !futureValueExists &&
            AddressResolverLib.genesisValueVault().getBalance(_ccy, _user) == 0
        ) {
            Storage.slot().usedCurrencies[_user].remove(_ccy);
        }
    }

    function _cleanUpOrders(
        bytes32 _ccy,
        uint256 _maturity,
        address _user
    ) internal returns (uint256 activeOrderCount, bool isCleaned) {
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];

        (
            uint256 activeLendOrderCount,
            uint256 activeBorrowOrderCount,
            uint256 removedLendOrderFutureValue,
            uint256 removedBorrowOrderFutureValue,
            uint256 removedLendOrderAmount,
            uint256 removedBorrowOrderAmount,
            uint256 userCurrentMaturity
        ) = ILendingMarket(Storage.slot().lendingMarkets[_ccy]).cleanUpOrders(orderBookId, _user);

        if (removedLendOrderAmount > removedBorrowOrderAmount) {
            AddressResolverLib.tokenVault().removeDepositAmount(
                _user,
                _ccy,
                removedLendOrderAmount - removedBorrowOrderAmount
            );
        } else if (removedLendOrderAmount < removedBorrowOrderAmount) {
            AddressResolverLib.tokenVault().addDepositAmount(
                _user,
                _ccy,
                removedBorrowOrderAmount - removedLendOrderAmount
            );
        }

        if (removedLendOrderFutureValue > 0) {
            IFutureValueVault(Storage.slot().futureValueVaults[_ccy]).increase(
                orderBookId,
                _user,
                removedLendOrderFutureValue,
                userCurrentMaturity,
                false
            );
            emit OrdersFilledInAsync(
                _user,
                _ccy,
                ProtocolTypes.Side.LEND,
                userCurrentMaturity,
                removedLendOrderAmount,
                removedLendOrderFutureValue
            );
        }

        if (removedBorrowOrderFutureValue > 0) {
            IFutureValueVault(Storage.slot().futureValueVaults[_ccy]).decrease(
                orderBookId,
                _user,
                removedBorrowOrderFutureValue,
                userCurrentMaturity,
                false
            );
            emit OrdersFilledInAsync(
                _user,
                _ccy,
                ProtocolTypes.Side.BORROW,
                userCurrentMaturity,
                removedBorrowOrderAmount,
                removedBorrowOrderFutureValue
            );
        }

        isCleaned = (removedLendOrderFutureValue + removedBorrowOrderFutureValue) > 0;
        activeOrderCount = activeLendOrderCount + activeBorrowOrderCount;
    }

    function _getFundsFromFutureValueVault(
        bytes32 _ccy,
        address _user,
        CalculateActualFundsVars memory vars,
        uint8 currentOrderBookId,
        uint256 currentMaturity,
        bool isDefaultMarket
    ) internal view returns (FutureValueVaultFunds memory funds) {
        (int256 futureValueInMaturity, uint256 fvMaturity) = vars.futureValueVault.getBalance(
            currentOrderBookId,
            _user
        );

        if (futureValueInMaturity != 0) {
            if (currentMaturity != fvMaturity) {
                if (vars.isDefaultMarket) {
                    funds.genesisValue = AddressResolverLib.genesisValueVault().calculateGVFromFV(
                        _ccy,
                        fvMaturity,
                        futureValueInMaturity
                    );
                }
            } else if (currentMaturity == fvMaturity) {
                if (vars.isTotal && !isDefaultMarket) {
                    uint256 unitPrice = _getDefaultOrderBookMarketUnitPrice(vars);

                    (funds.presentValue, funds.futureValue) = _convertFVtoOtherMaturity(
                        _ccy,
                        vars.market,
                        fvMaturity,
                        futureValueInMaturity,
                        unitPrice
                    );

                    if (funds.futureValue < 0) {
                        uint256 defaultOrderBookMinDebtUnitPrice = _getDefaultOrderBookMinDebtUnitPrice(
                                vars
                            );

                        if (unitPrice < defaultOrderBookMinDebtUnitPrice) {
                            funds.presentValue = _calculatePVFromFV(
                                funds.futureValue,
                                defaultOrderBookMinDebtUnitPrice
                            );
                        }
                    }
                } else if (vars.isTotal || !vars.isDefaultMarket || isDefaultMarket) {
                    uint256 unitPrice = vars.market.getMarketUnitPrice(vars.orderBookId);
                    funds.futureValue = futureValueInMaturity;

                    // Apply min debt unit price if the future value is negative (debt).
                    if (funds.futureValue < 0) {
                        uint256 currentMinDebtUnitPrice = getCurrentMinDebtUnitPrice(
                            currentMaturity,
                            vars.minDebtUnitPrice
                        );

                        funds.presentValue = _calculatePVFromFV(
                            futureValueInMaturity,
                            unitPrice < currentMinDebtUnitPrice
                                ? currentMinDebtUnitPrice
                                : unitPrice
                        );
                    } else {
                        funds.presentValue = _calculatePVFromFV(futureValueInMaturity, unitPrice);
                    }
                }
            }
        }
    }

    function _getFundsFromInactiveBorrowOrders(
        bytes32 _ccy,
        address _user,
        CalculateActualFundsVars memory vars,
        uint8 currentOrderBookId,
        uint256 currentMaturity,
        bool isDefaultMarket
    ) internal view returns (InactiveBorrowOrdersFunds memory funds) {
        uint256 filledFutureValue;
        uint256 orderMaturity;
        uint256 currentMinDebtUnitPrice = getCurrentMinDebtUnitPrice(
            currentMaturity,
            vars.minDebtUnitPrice
        );

        (funds.workingOrdersAmount, funds.borrowedAmount, filledFutureValue, orderMaturity) = vars
            .market
            .getTotalAmountFromBorrowOrders(currentOrderBookId, _user, currentMinDebtUnitPrice);

        if (filledFutureValue != 0) {
            if (currentMaturity != orderMaturity) {
                if (vars.isDefaultMarket) {
                    funds.genesisValue = AddressResolverLib.genesisValueVault().calculateGVFromFV(
                        _ccy,
                        orderMaturity,
                        filledFutureValue.toInt256()
                    );
                }
            } else if (currentMaturity == orderMaturity) {
                if (vars.isTotal && !isDefaultMarket) {
                    uint256 unitPrice = _getDefaultOrderBookMarketUnitPrice(vars);

                    (funds.presentValue, funds.futureValue) = _convertFVtoOtherMaturity(
                        _ccy,
                        vars.market,
                        orderMaturity,
                        filledFutureValue.toInt256(),
                        unitPrice
                    );

                    uint256 defaultOrderBookMinDebtUnitPrice = _getDefaultOrderBookMinDebtUnitPrice(
                        vars
                    );

                    if (unitPrice < defaultOrderBookMinDebtUnitPrice) {
                        funds.presentValue = _calculatePVFromFV(
                            funds.futureValue,
                            defaultOrderBookMinDebtUnitPrice
                        );
                    }
                } else if (vars.isTotal || !vars.isDefaultMarket || isDefaultMarket) {
                    uint256 unitPrice = vars.market.getMarketUnitPrice(vars.orderBookId);

                    funds.futureValue = filledFutureValue.toInt256();
                    funds.presentValue = _calculatePVFromFV(
                        funds.futureValue,
                        unitPrice < currentMinDebtUnitPrice ? currentMinDebtUnitPrice : unitPrice
                    );
                }
            }
        }
    }

    function _getFundsFromInactiveLendOrders(
        bytes32 _ccy,
        address _user,
        CalculateActualFundsVars memory vars,
        uint8 currentOrderBookId,
        uint256 currentMaturity,
        bool isDefaultMarket
    ) internal view returns (InactiveLendOrdersFunds memory funds) {
        uint256 filledFutureValue;
        uint256 orderMaturity;
        (funds.workingOrdersAmount, funds.lentAmount, filledFutureValue, orderMaturity) = vars
            .market
            .getTotalAmountFromLendOrders(currentOrderBookId, _user);

        if (filledFutureValue != 0) {
            if (currentMaturity != orderMaturity) {
                if (vars.isDefaultMarket) {
                    funds.genesisValue = AddressResolverLib.genesisValueVault().calculateGVFromFV(
                        _ccy,
                        orderMaturity,
                        filledFutureValue.toInt256()
                    );
                }
            } else if (currentMaturity == orderMaturity) {
                if (vars.isTotal && !isDefaultMarket) {
                    (funds.presentValue, funds.futureValue) = _convertFVtoOtherMaturity(
                        _ccy,
                        vars.market,
                        orderMaturity,
                        filledFutureValue.toInt256(),
                        vars.market.getMarketUnitPrice(vars.defaultOrderBookId)
                    );
                } else if (vars.isTotal || !vars.isDefaultMarket || isDefaultMarket) {
                    funds.futureValue = filledFutureValue.toInt256();
                    funds.presentValue = _calculatePVFromFV(
                        vars.market,
                        vars.orderBookId,
                        funds.futureValue
                    );
                }
            }
        }
    }

    function _convertFVtoOtherMaturity(
        bytes32 _ccy,
        ILendingMarket _market,
        uint256 _fromMaturity,
        int256 _fromFutureValue,
        uint256 _toUnitPrice
    ) internal view returns (int256 presentValue, int256 futureValue) {
        // uint256 unitPrice = _market.getMarketUnitPrice(Storage.slot().orderBookIdLists[_ccy][0]);

        if (
            AddressResolverLib.genesisValueVault().getAutoRollLog(_ccy, _fromMaturity).unitPrice ==
            0
        ) {
            presentValue = _calculatePVFromFV(
                _market,
                Storage.slot().maturityOrderBookIds[_ccy][_fromMaturity],
                _fromFutureValue
            );
            futureValue = _calculateFVFromPV(presentValue, _toUnitPrice);
        } else {
            futureValue = AddressResolverLib.genesisValueVault().calculateFVFromFV(
                _ccy,
                _fromMaturity,
                0,
                _fromFutureValue
            );
            presentValue = _calculatePVFromFV(futureValue, _toUnitPrice);
        }
    }

    function calculatePVFromFV(
        bytes32 _ccy,
        uint256 _maturity,
        int256 _futureValue
    ) public view returns (int256 presentValue) {
        presentValue = _calculatePVFromFV(
            ILendingMarket(Storage.slot().lendingMarkets[_ccy]),
            Storage.slot().maturityOrderBookIds[_ccy][_maturity],
            _futureValue
        );
    }

    function calculateFVFromPV(
        bytes32 _ccy,
        uint256 _maturity,
        int256 _presentValue
    ) public view returns (int256 futureValue) {
        uint256 unitPrice = ILendingMarket(Storage.slot().lendingMarkets[_ccy]).getMarketUnitPrice(
            Storage.slot().maturityOrderBookIds[_ccy][_maturity]
        );
        futureValue = _calculateFVFromPV(_presentValue, unitPrice);
    }

    function _convertToBaseCurrencyAtMarketTerminationPrice(
        bytes32 _ccy,
        int256 _amount
    ) internal view returns (int256) {
        uint8 decimals = AddressResolverLib.currencyController().getDecimals(_ccy);
        return
            (_amount * Storage.slot().marketTerminationPrices[_ccy]).div(
                (10 ** decimals).toInt256()
            );
    }

    function _convertFromBaseCurrencyAtMarketTerminationPrice(
        bytes32 _ccy,
        uint256 _amount
    ) internal view returns (uint256) {
        uint8 decimals = AddressResolverLib.currencyController().getDecimals(_ccy);
        return
            (_amount * 10 ** decimals).div(
                Storage.slot().marketTerminationPrices[_ccy].toUint256()
            );
    }

    function _resetFundsPerCurrency(bytes32 _ccy, address _user) internal returns (int256 amount) {
        amount = getActualFunds(_ccy, 0, _user, 0).presentValue;

        uint256[] memory maturities = Storage.slot().usedMaturities[_ccy][_user].values();
        for (uint256 j; j < maturities.length; j++) {
            IFutureValueVault(Storage.slot().futureValueVaults[_ccy]).executeForcedReset(
                Storage.slot().maturityOrderBookIds[_ccy][maturities[j]],
                _user
            );
        }

        AddressResolverLib.genesisValueVault().executeForcedReset(_ccy, _user);

        Storage.slot().usedCurrencies[_user].remove(_ccy);
    }

    function _resetFundsPerMaturity(
        bytes32 _ccy,
        uint256 _maturity,
        address _user,
        int256 _amount
    ) internal returns (int256 totalRemovedAmount) {
        int256 currentFVAmount;
        int256 currentGVAmount;

        (totalRemovedAmount, currentFVAmount) = IFutureValueVault(
            Storage.slot().futureValueVaults[_ccy]
        ).executeForcedReset(Storage.slot().maturityOrderBookIds[_ccy][_maturity], _user, _amount);

        int256 remainingAmount = _amount - totalRemovedAmount;

        bool isDefaultMarket = Storage.slot().maturityOrderBookIds[_ccy][_maturity] ==
            Storage.slot().orderBookIdLists[_ccy][0];

        if (isDefaultMarket && remainingAmount != 0) {
            int256 removedAmount;
            (removedAmount, currentGVAmount) = AddressResolverLib
                .genesisValueVault()
                .executeForcedReset(_ccy, _maturity, _user, remainingAmount);
            totalRemovedAmount += removedAmount;
        }

        if (currentFVAmount == 0 && currentGVAmount == 0) {
            Storage.slot().usedMaturities[_ccy][_user].remove(_maturity);

            if (Storage.slot().usedMaturities[_ccy][_user].length() == 0) {
                Storage.slot().usedCurrencies[_user].remove(_ccy);
            }
        }
    }

    function _getDefaultOrderBookMinDebtUnitPrice(
        CalculateActualFundsVars memory vars
    ) private view returns (uint256) {
        if (vars.defaultOrderBookMinDebtUnitPrice == 0 && vars.minDebtUnitPrice != 0) {
            vars.defaultOrderBookMinDebtUnitPrice = getCurrentMinDebtUnitPrice(
                vars.market.getMaturity(vars.defaultOrderBookId),
                vars.minDebtUnitPrice
            );
        }

        return vars.defaultOrderBookMinDebtUnitPrice;
    }

    function _getDefaultOrderBookMarketUnitPrice(
        CalculateActualFundsVars memory vars
    ) private view returns (uint256) {
        if (vars.defaultOrderBookMarketUnitPrice == 0) {
            vars.defaultOrderBookMarketUnitPrice = vars.market.getMarketUnitPrice(
                vars.defaultOrderBookId
            );
        }

        return vars.defaultOrderBookMarketUnitPrice;
    }

    function _calculatePVFromFV(
        ILendingMarket _market,
        uint8 _orderBookId,
        int256 _futureValue
    ) internal view returns (int256 presentValue) {
        uint256 unitPrice = _market.getMarketUnitPrice(_orderBookId);
        presentValue = _calculatePVFromFV(_futureValue, unitPrice);
    }

    function _calculatePVFromFV(
        int256 _futureValue,
        uint256 _unitPrice
    ) internal pure returns (int256) {
        uint256 unitPrice = _unitPrice == 0 ? Constants.PRICE_DIGIT : _unitPrice;
        // NOTE: The formula is: presentValue = futureValue * unitPrice.
        return (_futureValue * unitPrice.toInt256()).div(Constants.PRICE_DIGIT.toInt256());
    }

    function _calculatePVFromFV(
        uint256 _futureValue,
        uint256 _unitPrice
    ) internal pure returns (uint256) {
        uint256 unitPrice = _unitPrice == 0 ? Constants.PRICE_DIGIT : _unitPrice;
        // NOTE: The formula is: presentValue = futureValue * unitPrice.
        return (_futureValue * unitPrice).div(Constants.PRICE_DIGIT);
    }

    function _calculateFVFromPV(
        int256 _presentValue,
        uint256 _unitPrice
    ) internal pure returns (int256) {
        uint256 unitPrice = _unitPrice == 0 ? Constants.PRICE_DIGIT : _unitPrice;
        // NOTE: The formula is: futureValue = presentValue / unitPrice.
        return (_presentValue * Constants.PRICE_DIGIT.toInt256()).div(unitPrice.toInt256());
    }
}
