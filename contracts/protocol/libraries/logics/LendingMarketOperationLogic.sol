// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// dependencies
import {IERC20} from "../../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "../../../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
import {Strings} from "../../../dependencies/openzeppelin/utils/Strings.sol";
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
import {LendingMarketControllerStorage as Storage, ZCTokenInfo, TerminationCurrencyCache, ObservationPeriodLog} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketOperationLogic {
    using SafeCast for uint256;
    using RoundingUint256 for uint256;
    using SafeCast for uint256;
    using RoundingInt256 for int256;

    uint256 public constant OBSERVATION_PERIOD = 6 hours;
    uint8 public constant COMPOUND_FACTOR_DECIMALS = 36;
    uint8 public constant GENESIS_VALUE_BASE_DECIMALS = 18;
    uint256 public constant PRE_ORDER_BASE_PERIOD = 7 days;

    error InvalidCompoundFactor();
    error InvalidCurrency();
    error InvalidOpeningDate();
    error InvalidPreOpeningDate();
    error InvalidTimestamp();
    error InvalidMinDebtUnitPrice();
    error LendingMarketNotInitialized();
    error NotEnoughOrderBooks();
    error AlreadyZCTokenExists(address tokenAddress);
    error InvalidMaturity(uint256 maturity);

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
        uint8 indexed orderBookId,
        uint256 openingDate,
        uint256 preOpeningDate,
        uint256 maturity
    );

    event OrderBooksRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);
    event EmergencyTerminationExecuted(uint256 timestamp);

    event ZCTokenCreated(
        bytes32 indexed ccy,
        uint256 indexed maturity,
        string name,
        string symbol,
        uint8 decimals,
        address tokenAddress
    );

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
        createZCToken(_ccy, 0);

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

        uint256[] memory maturities = market.getMaturities(Storage.slot().orderBookIdLists[_ccy]);
        uint256 newMaturity;

        if (maturities.length == 0) {
            newMaturity = AddressResolverLib.genesisValueVault().getCurrentMaturity(_ccy);
        } else {
            uint256 lastMaturity = maturities[maturities.length - 1];
            newMaturity = calculateNextMaturity(lastMaturity, Storage.slot().marketBasePeriod);
        }

        if (_openingDate >= newMaturity) revert InvalidOpeningDate();

        uint8 orderBookId = market.createOrderBook(newMaturity, _openingDate, _preOpeningDate);

        Storage.slot().orderBookIdLists[_ccy].push(orderBookId);
        Storage.slot().maturityOrderBookIds[_ccy][newMaturity] = orderBookId;

        createZCToken(_ccy, newMaturity);

        emit OrderBookCreated(_ccy, orderBookId, _openingDate, _preOpeningDate, newMaturity);
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
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];
        uint256 openingUnitPrice;
        uint256 openingDate;
        uint256 totalOffsetAmount;

        (
            openingUnitPrice,
            totalOffsetAmount,
            openingDate,
            partiallyFilledLendingOrder,
            partiallyFilledBorrowingOrder
        ) = market.executeItayoseCall(orderBookId);

        // Updates the pending order amount for both side orders.
        // Since the partially filled orders are updated with `updateFundsForMaker()`,
        // their amount is subtracted from `pendingOrderAmounts`.
        Storage.slot().pendingOrderAmounts[_ccy][_maturity] +=
            (totalOffsetAmount * 2) -
            partiallyFilledLendingOrder.amount -
            partiallyFilledBorrowingOrder.amount;

        // Save the openingUnitPrice as first compound factor
        // if it is a first Itayose call at the nearest market.
        if (openingUnitPrice > 0 && Storage.slot().orderBookIdLists[_ccy][0] == orderBookId) {
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

        uint8[] storage orderBookIds = Storage.slot().orderBookIdLists[_ccy];

        if (orderBookIds.length < 2) revert NotEnoughOrderBooks();

        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint256[] memory maturities = market.getMaturities(orderBookIds);

        uint8 maturedOrderBookId = orderBookIds[0];
        uint8 destinationOrderBookId = orderBookIds[1];
        uint256 maturedOrderBookMaturity = maturities[0];
        uint256 destinationOrderBookMaturity = maturities[1];

        uint256 newMaturity = calculateNextMaturity(
            maturities[maturities.length - 1],
            Storage.slot().marketBasePeriod
        );

        // Delete the matured order book from the list
        for (uint256 i; i < orderBookIds.length - 1; i++) {
            orderBookIds[i] = orderBookIds[i + 1];
        }
        orderBookIds.pop();

        uint256 autoRollUnitPrice = _calculateAutoRollUnitPrice(
            _ccy,
            maturedOrderBookMaturity,
            destinationOrderBookMaturity,
            destinationOrderBookId,
            market
        );

        market.executeAutoRoll(maturedOrderBookId, destinationOrderBookId, autoRollUnitPrice);

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
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];

        if (Storage.slot().orderBookIdLists[_ccy][1] == orderBookId) {
            uint256 nearestMaturity = ILendingMarket(Storage.slot().lendingMarkets[_ccy])
                .getMaturity(Storage.slot().orderBookIdLists[_ccy][0]);

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

    function createZCToken(bytes32 _ccy, uint256 _maturity) public {
        if (Storage.slot().zcTokens[_ccy][_maturity] != address(0)) {
            revert AlreadyZCTokenExists(Storage.slot().zcTokens[_ccy][_maturity]);
        }

        if (_maturity != 0 && Storage.slot().maturityOrderBookIds[_ccy][_maturity] == 0) {
            revert InvalidMaturity(_maturity);
        }

        address tokenAddress = AddressResolverLib.tokenVault().getTokenAddress(_ccy);
        string memory symbol = string.concat("zc", IERC20Metadata(tokenAddress).symbol());
        string memory name = string.concat("ZC ", IERC20Metadata(tokenAddress).name());
        uint8 decimals = IERC20Metadata(tokenAddress).decimals() + GENESIS_VALUE_BASE_DECIMALS;

        // If the maturity is 0, the ZCToken is created as a perpetual one.
        // Otherwise, the ZCToken is created per maturity.
        if (_maturity != 0) {
            (uint256 year, uint256 month, ) = TimeLibrary.timestampToDate(_maturity);

            string memory formattedMaturity = string.concat(
                Strings.toString(year),
                "-",
                month < 10 ? string.concat("0", Strings.toString(month)) : Strings.toString(month)
            );

            symbol = string.concat(symbol, "-", formattedMaturity);
            name = string.concat(name, " ", _getShortMonthYearString(_maturity));
        }

        address zcToken = AddressResolverLib.beaconProxyController().deployZCToken(
            name,
            symbol,
            decimals,
            tokenAddress,
            _maturity
        );

        Storage.slot().zcTokens[_ccy][_maturity] = zcToken;
        Storage.slot().zcTokenInfo[zcToken] = ZCTokenInfo({ccy: _ccy, maturity: _maturity});

        emit ZCTokenCreated(_ccy, _maturity, name, symbol, decimals, zcToken);
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

    function _getShortMonthYearString(uint256 timestamp) internal pure returns (string memory) {
        (uint256 year, uint256 month, ) = TimeLibrary.timestampToDate(timestamp);
        string[12] memory months = [
            "JAN",
            "FEB",
            "MAR",
            "APR",
            "MAY",
            "JUN",
            "JUL",
            "AUG",
            "SEP",
            "OCT",
            "NOV",
            "DEC"
        ];
        return string(abi.encodePacked(months[month - 1], Strings.toString(year)));
    }

    function _calculateAutoRollUnitPrice(
        bytes32 _ccy,
        uint256 _nearestMaturity,
        uint256 _destinationMaturity,
        uint8 _destinationOrderBookId,
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
                _destinationOrderBookId
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
