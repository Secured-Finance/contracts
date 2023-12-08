// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

// dependencies
import {IERC20} from "../../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
import {AutoRollLog} from "../../interfaces/IGenesisValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "../BokkyPooBahsDateTimeLibrary.sol";
import {Constants} from "../Constants.sol";
import {FilledOrder, PartiallyFilledOrder} from "../OrderBookLib.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {RoundingInt256} from "../math/RoundingInt256.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage, TerminationCurrencyCache, ObservationPeriodLog} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketOperationLogic {
    using SafeCast for uint256;
    using RoundingUint256 for uint256;
    using SafeCast for uint256;
    using RoundingInt256 for int256;

    uint256 public constant OBSERVATION_PERIOD = 6 hours;
    uint256 public constant PRE_ORDER_BASE_PERIOD = 7 days;
    uint8 public constant COMPOUND_FACTOR_DECIMALS = 36;

    error InvalidCompoundFactor();
    error InvalidCurrency();
    error InvalidOpeningDate();
    error InvalidPreOpeningDate();
    error InvalidTimestamp();
    error InvalidMinDebtUnitPrice();
    error LendingMarketNotInitialized();
    error NotEnoughOrderBooks();

    event LendingMarketInitialized(
        bytes32 indexed ccy,
        uint256 genesisDate,
        uint256 compoundFactor,
        uint256 orderFeeRate,
        uint256 circuitBreakerLimitRange,
        address lendingMarket,
        address futureValueVault
    );

    event MinDebtUnitPriceUpdated(bytes32 indexed ccy, uint256 minDebtUnitPrice);

    event OrderBookCreated(
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 openingDate,
        uint256 preOpeningDate
    );

    event OrderBooksRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);
    event EmergencyTerminationExecuted(uint256 timestamp);

    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor,
        uint256 _orderFeeRate,
        uint256 _circuitBreakerLimitRange,
        uint256 _minDebtUnitPrice
    ) external {
        if (!AddressResolverLib.currencyController().currencyExists(_ccy)) {
            revert InvalidCurrency();
        }

        if (_compoundFactor == 0) revert InvalidCompoundFactor();

        AddressResolverLib.genesisValueVault().initializeCurrencySetting(
            _ccy,
            COMPOUND_FACTOR_DECIMALS,
            _compoundFactor,
            calculateNextMaturity(_genesisDate, Storage.slot().marketBasePeriod)
        );

        address lendingMarket = AddressResolverLib.beaconProxyController().deployLendingMarket(
            _ccy,
            _orderFeeRate,
            _circuitBreakerLimitRange
        );
        address futureValueVault = AddressResolverLib
            .beaconProxyController()
            .deployFutureValueVault();

        Storage.slot().genesisDates[_ccy] = _genesisDate;
        Storage.slot().lendingMarkets[_ccy] = lendingMarket;
        Storage.slot().futureValueVaults[_ccy] = futureValueVault;

        updateMinDebtUnitPrice(_ccy, _minDebtUnitPrice);

        emit LendingMarketInitialized(
            _ccy,
            _genesisDate,
            _compoundFactor,
            _orderFeeRate,
            _circuitBreakerLimitRange,
            lendingMarket,
            futureValueVault
        );
    }

    function updateMinDebtUnitPrice(bytes32 _ccy, uint256 _minDebtUnitPrice) public {
        if (_minDebtUnitPrice > Constants.PRICE_DIGIT) revert InvalidMinDebtUnitPrice();

        Storage.slot().minDebtUnitPrices[_ccy] = _minDebtUnitPrice;
        emit MinDebtUnitPriceUpdated(_ccy, _minDebtUnitPrice);
    }

    function createOrderBook(bytes32 _ccy, uint256 _openingDate, uint256 _preOpeningDate) public {
        if (!AddressResolverLib.genesisValueVault().isInitialized(_ccy)) {
            revert LendingMarketNotInitialized();
        }
        if (!AddressResolverLib.currencyController().currencyExists(_ccy)) {
            revert InvalidCurrency();
        }
        if (_preOpeningDate > _openingDate) revert InvalidPreOpeningDate();

        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);

        uint256[] memory maturities = Storage.slot().orderBookMaturities[_ccy];
        uint256 newMaturity;

        if (maturities.length == 0) {
            newMaturity = AddressResolverLib.genesisValueVault().getCurrentMaturity(_ccy);
        } else {
            uint256 lastMaturity = maturities[maturities.length - 1];
            newMaturity = calculateNextMaturity(lastMaturity, Storage.slot().marketBasePeriod);
        }

        if (_openingDate >= newMaturity) revert InvalidOpeningDate();

        market.createOrderBook(newMaturity, _openingDate, _preOpeningDate);

        Storage.slot().orderBookMaturities[_ccy].push(newMaturity);
        Storage.slot().maturityExists[_ccy][newMaturity] = true;

        emit OrderBookCreated(_ccy, newMaturity, _openingDate, _preOpeningDate);
    }

    function executeItayoseCall(
        bytes32 _ccy,
        uint256 _maturity
    )
        external
        returns (
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        )
    {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint256 openingUnitPrice;
        uint256 openingDate;
        uint256 totalOffsetAmount;

        (
            openingUnitPrice,
            totalOffsetAmount,
            openingDate,
            partiallyFilledLendingOrder,
            partiallyFilledBorrowingOrder
        ) = market.executeItayoseCall(_maturity);

        // Updates the pending order amount for both side orders.
        // Since the partially filled orders are updated with `updateFundsForMaker()`,
        // their amount is subtracted from `pendingOrderAmounts`.
        Storage.slot().pendingOrderAmounts[_ccy][_maturity] +=
            (totalOffsetAmount * 2) -
            partiallyFilledLendingOrder.amount -
            partiallyFilledBorrowingOrder.amount;

        // Save the openingUnitPrice as first compound factor
        // if it is a first Itayose call at the nearest market.
        if (openingUnitPrice > 0 && Storage.slot().orderBookMaturities[_ccy][0] == _maturity) {
            // Convert the openingUnitPrice determined by Itayose to the unit price on the Genesis Date.
            uint256 convertedUnitPrice = _convertUnitPrice(
                openingUnitPrice,
                _maturity,
                openingDate,
                Storage.slot().genesisDates[_ccy]
            );

            AddressResolverLib.genesisValueVault().updateInitialCompoundFactor(
                _ccy,
                convertedUnitPrice
            );
        }
    }

    function rotateOrderBooks(bytes32 _ccy) external {
        if (!AddressResolverLib.currencyController().currencyExists(_ccy)) {
            revert InvalidCurrency();
        }

        uint256[] storage maturities = Storage.slot().orderBookMaturities[_ccy];

        if (maturities.length < 2) revert NotEnoughOrderBooks();

        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);

        uint256 maturedOrderBookMaturity = maturities[0];
        uint256 destinationOrderBookMaturity = maturities[1];

        uint256 newMaturity = calculateNextMaturity(
            maturities[maturities.length - 1],
            Storage.slot().marketBasePeriod
        );

        // Delete the matured order book from the list
        for (uint256 i; i < maturities.length - 1; i++) {
            maturities[i] = maturities[i + 1];
        }
        maturities.pop();

        uint256 autoRollUnitPrice = _calculateAutoRollUnitPrice(
            _ccy,
            maturedOrderBookMaturity,
            destinationOrderBookMaturity,
            market
        );

        market.executeAutoRoll(
            maturedOrderBookMaturity,
            destinationOrderBookMaturity,
            autoRollUnitPrice
        );

        createOrderBook(
            _ccy,
            destinationOrderBookMaturity,
            destinationOrderBookMaturity - PRE_ORDER_BASE_PERIOD
        );

        AddressResolverLib.genesisValueVault().executeAutoRoll(
            _ccy,
            maturedOrderBookMaturity,
            destinationOrderBookMaturity,
            autoRollUnitPrice,
            market.getOrderFeeRate()
        );

        Storage.slot().maturityExists[_ccy][newMaturity] = true;

        emit OrderBooksRotated(_ccy, maturedOrderBookMaturity, newMaturity);
    }

    function executeEmergencyTermination() external {
        Storage.slot().terminationDate = block.timestamp;

        bytes32[] memory currencies = AddressResolverLib.currencyController().getCurrencies();
        bytes32[] memory collateralCurrencies = AddressResolverLib
            .tokenVault()
            .getCollateralCurrencies();

        for (uint256 i; i < currencies.length; i++) {
            bytes32 ccy = currencies[i];

            Storage.slot().terminationCurrencyCaches[ccy] = TerminationCurrencyCache({
                price: AddressResolverLib.currencyController().getAggregatedLastPrice(ccy),
                decimals: AddressResolverLib.currencyController().getDecimals(ccy)
            });
        }

        for (uint256 i; i < collateralCurrencies.length; i++) {
            bytes32 ccy = collateralCurrencies[i];
            address tokenAddress = AddressResolverLib.tokenVault().getTokenAddress(ccy);
            uint256 balance = IERC20(tokenAddress).balanceOf(
                address(AddressResolverLib.tokenVault())
            );

            Storage.slot().terminationCollateralRatios[ccy] = AddressResolverLib
                .currencyController()
                .convertToBaseCurrency(ccy, balance);
        }

        emit EmergencyTerminationExecuted(block.timestamp);
    }

    function pauseLendingMarket(bytes32 _ccy) public {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        market.pause();
    }

    function unpauseLendingMarket(bytes32 _ccy) public {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        market.unpause();
    }

    function updateOrderLogs(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _filledAmount,
        uint256 _filledFutureValue
    ) external {
        if (Storage.slot().orderBookMaturities[_ccy][1] == _maturity) {
            uint256 nearestMaturity = Storage.slot().orderBookMaturities[_ccy][0];

            if (
                (block.timestamp < nearestMaturity) &&
                (block.timestamp >= (nearestMaturity - OBSERVATION_PERIOD))
            ) {
                Storage.slot().observationPeriodLogs[_ccy][_maturity].totalAmount += _filledAmount;
                Storage
                .slot()
                .observationPeriodLogs[_ccy][_maturity].totalFutureValue += _filledFutureValue;
            }
        }
    }

    function calculateNextMaturity(
        uint256 _timestamp,
        uint256 _period
    ) public pure returns (uint256) {
        if (_period == 0) {
            return TimeLibrary.addDays(_timestamp, 7);
        } else {
            return _getLastFridayAfterMonths(_timestamp, _period);
        }
    }

    function _getLastFridayAfterMonths(
        uint256 _timestamp,
        uint256 _months
    ) internal pure returns (uint256 lastFridayTimestamp) {
        (uint256 year, uint256 month, ) = TimeLibrary.timestampToDate(
            TimeLibrary.addMonths(_timestamp, _months + 1)
        );
        uint256 thirdMonthEndTimestamp = TimeLibrary.timestampFromDate(year, month, 0);
        uint256 dayOfWeek = TimeLibrary.getDayOfWeek(thirdMonthEndTimestamp);
        uint256 diff = (dayOfWeek < TimeLibrary.DOW_FRI ? 7 : 0) + dayOfWeek - TimeLibrary.DOW_FRI;
        lastFridayTimestamp = TimeLibrary.subDays(thirdMonthEndTimestamp, diff);

        if (lastFridayTimestamp == 0) revert InvalidTimestamp();

        return lastFridayTimestamp;
    }

    function _calculateAutoRollUnitPrice(
        bytes32 _ccy,
        uint256 _nearestMaturity,
        uint256 _destinationMaturity,
        ILendingMarket _market
    ) internal view returns (uint256 autoRollUnitPrice) {
        ObservationPeriodLog memory log = Storage.slot().observationPeriodLogs[_ccy][
            _destinationMaturity
        ];

        // The auto-roll unit price is calculated based on the volume-weighted average price of orders that are filled
        // in the observation period. If there is no order filled in that period, the auto-roll unit price is calculated
        // using the last block price. If the last block price is older than the last auto-roll date,
        // the last auto-roll unit price is reused as the current auto-roll unit price.
        if (log.totalFutureValue != 0) {
            autoRollUnitPrice = (log.totalAmount * Constants.PRICE_DIGIT).div(log.totalFutureValue);
        } else {
            (uint256[] memory unitPrices, uint48 timestamp) = _market.getBlockUnitPriceHistory(
                _destinationMaturity
            );

            AutoRollLog memory autoRollLog = AddressResolverLib
                .genesisValueVault()
                .getLatestAutoRollLog(_ccy);

            if (unitPrices[0] != 0 && timestamp >= autoRollLog.prev) {
                autoRollUnitPrice = _convertUnitPrice(
                    unitPrices[0],
                    _destinationMaturity,
                    timestamp,
                    _nearestMaturity
                );
            } else {
                autoRollUnitPrice = autoRollLog.unitPrice;
            }
        }
    }

    function _convertUnitPrice(
        uint256 _unitPrice,
        uint256 _maturity,
        uint256 _currentTimestamp,
        uint256 _destinationTimestamp
    ) internal pure returns (uint256) {
        // NOTE:The formula is:
        // 1) currentDuration = maturity - currentTimestamp
        // 2) destinationDuration = maturity - destinationTimestamp
        // 3) unitPrice = (currentUnitPrice * currentDuration)
        //      / ((1 - currentUnitPrice) * destinationDuration + currentUnitPrice * currentDuration)

        uint256 currentDuration = _maturity - _currentTimestamp;
        uint256 destinationDuration = _maturity - _destinationTimestamp;
        return
            (Constants.PRICE_DIGIT * _unitPrice * currentDuration) /
            (((Constants.PRICE_DIGIT - _unitPrice) * destinationDuration) +
                (_unitPrice * currentDuration));
    }
}
