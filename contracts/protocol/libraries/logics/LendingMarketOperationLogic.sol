// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// dependencies
import {IERC20} from "../../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {ILendingMarketController} from "../../interfaces/ILendingMarketController.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
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
import {LendingMarketControllerStorage as Storage, ObservationPeriodLog} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketOperationLogic {
    using SafeCast for uint256;
    using RoundingUint256 for uint256;
    using SafeCast for uint256;
    using RoundingInt256 for int256;

    uint256 public constant OBSERVATION_PERIOD = 6 hours;

    error InvalidCompoundFactor();
    error InvalidCurrency();
    error InvalidOpeningDate();
    error InvalidPreOpeningDate();
    error InvalidTimestamp();
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

    event OrderBookCreated(
        bytes32 indexed ccy,
        uint8 indexed orderBookId,
        uint256 openingDate,
        uint256 maturity
    );

    event OrderBooksRotated(bytes32 ccy, uint256 oldMaturity, uint256 newMaturity);
    event EmergencyTerminationExecuted(uint256 timestamp);

    function initializeLendingMarket(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor,
        uint256 _orderFeeRate,
        uint256 _circuitBreakerLimitRange
    ) external {
        if (!AddressResolverLib.currencyController().currencyExists(_ccy)) {
            revert InvalidCurrency();
        }

        if (_compoundFactor == 0) revert InvalidCompoundFactor();

        AddressResolverLib.genesisValueVault().initializeCurrencySetting(
            _ccy,
            36,
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

    function createOrderBook(
        bytes32 _ccy,
        uint256 _openingDate,
        uint256 _preOpeningDate
    ) external {
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

        emit OrderBookCreated(_ccy, orderBookId, _openingDate, newMaturity);
    }

    function executeItayoseCall(bytes32 _ccy, uint256 _maturity)
        external
        returns (
            PartiallyFilledOrder memory partiallyFilledLendingOrder,
            PartiallyFilledOrder memory partiallyFilledBorrowingOrder
        )
    {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];

        if (market.isItayosePeriod(orderBookId)) {
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

            if (totalOffsetAmount > 0) {
                address futureValueVault = Storage.slot().futureValueVaults[_ccy];
                IFutureValueVault(futureValueVault).setInitialTotalSupply(
                    _maturity,
                    (totalOffsetAmount * Constants.PRICE_DIGIT).div(openingUnitPrice).toInt256()
                );
            }

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
    }

    function rotateOrderBooks(bytes32 _ccy) external returns (uint256 newMaturity) {
        if (!AddressResolverLib.currencyController().currencyExists(_ccy)) {
            revert InvalidCurrency();
        }

        uint8[] storage orderBookIds = Storage.slot().orderBookIdLists[_ccy];

        if (orderBookIds.length < 2) revert NotEnoughOrderBooks();

        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint256[] memory maturities = market.getMaturities(orderBookIds);

        uint8 maturedOrderBookId = orderBookIds[0];
        uint8 destinationOrderBookId = orderBookIds[1];
        uint256 destinationOrderBookMaturity = maturities[1];

        newMaturity = calculateNextMaturity(
            maturities[maturities.length - 1],
            Storage.slot().marketBasePeriod
        );

        // Rotate the order of the market
        for (uint256 i; i < orderBookIds.length; i++) {
            uint8 orderBookId = (orderBookIds.length - 1) == i
                ? maturedOrderBookId
                : orderBookIds[i + 1];
            orderBookIds[i] = orderBookId;
        }

        uint256 autoRollUnitPrice = _calculateAutoRollUnitPrice(_ccy, destinationOrderBookMaturity);

        market.executeAutoRoll(
            maturedOrderBookId,
            destinationOrderBookId,
            newMaturity,
            destinationOrderBookMaturity,
            autoRollUnitPrice
        );

        AddressResolverLib.genesisValueVault().executeAutoRoll(
            _ccy,
            maturities[0],
            maturities[1],
            autoRollUnitPrice,
            market.getOrderFeeRate()
        );

        uint256 maturedMaturity = maturities[0];
        Storage.slot().maturityOrderBookIds[_ccy][newMaturity] = Storage
            .slot()
            .maturityOrderBookIds[_ccy][maturedMaturity];

        emit OrderBooksRotated(_ccy, maturedMaturity, newMaturity);
    }

    function executeEmergencyTermination() external {
        Storage.slot().marketTerminationDate = block.timestamp;

        bytes32[] memory currencies = AddressResolverLib.currencyController().getCurrencies();
        bytes32[] memory collateralCurrencies = AddressResolverLib
            .tokenVault()
            .getCollateralCurrencies();

        for (uint256 i; i < currencies.length; i++) {
            bytes32 ccy = currencies[i];

            pauseLendingMarkets(ccy);
            Storage.slot().marketTerminationPrices[ccy] = AddressResolverLib
                .currencyController()
                .getLastPrice(ccy);
        }

        for (uint256 i; i < collateralCurrencies.length; i++) {
            bytes32 ccy = collateralCurrencies[i];
            address tokenAddress = AddressResolverLib.tokenVault().getTokenAddress(ccy);
            uint256 balance = IERC20(tokenAddress).balanceOf(
                address(AddressResolverLib.tokenVault())
            );

            Storage.slot().marketTerminationRatios[ccy] = AddressResolverLib
                .currencyController()
                .convertToBaseCurrency(ccy, balance);
        }

        emit EmergencyTerminationExecuted(block.timestamp);
    }

    function pauseLendingMarkets(bytes32 _ccy) public {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        market.pauseMarket();
    }

    function unpauseLendingMarkets(bytes32 _ccy) public {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        market.unpauseMarket();
    }

    function updateOrderLogs(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _filledUnitPrice,
        uint256 _filledAmount,
        uint256 _filledFutureValue
    ) external {
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];

        if (Storage.slot().orderBookIdLists[_ccy][1] == orderBookId) {
            uint256 nearestMaturity = ILendingMarket(Storage.slot().lendingMarkets[_ccy])
                .getMaturity(Storage.slot().orderBookIdLists[_ccy][0]);

            if (Storage.slot().observationPeriodLogs[_ccy][_maturity].totalAmount == 0) {
                Storage.slot().estimatedAutoRollUnitPrice[_ccy][_maturity] = _convertUnitPrice(
                    _filledUnitPrice,
                    _maturity,
                    block.timestamp,
                    nearestMaturity
                );
            }

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

    function calculateNextMaturity(uint256 _timestamp, uint256 _period)
        public
        pure
        returns (uint256)
    {
        if (_period == 0) {
            return TimeLibrary.addDays(_timestamp, 7);
        } else {
            return _getLastFridayAfterMonths(_timestamp, _period);
        }
    }

    function _getLastFridayAfterMonths(uint256 _timestamp, uint256 _months)
        internal
        pure
        returns (uint256 lastFridayTimestamp)
    {
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

    function _calculateAutoRollUnitPrice(bytes32 _ccy, uint256 _maturity)
        internal
        view
        returns (uint256 autoRollUnitPrice)
    {
        ObservationPeriodLog memory log = Storage.slot().observationPeriodLogs[_ccy][_maturity];

        if (log.totalFutureValue != 0) {
            autoRollUnitPrice = (log.totalAmount * Constants.PRICE_DIGIT).div(log.totalFutureValue);
        } else if (Storage.slot().estimatedAutoRollUnitPrice[_ccy][_maturity] != 0) {
            autoRollUnitPrice = Storage.slot().estimatedAutoRollUnitPrice[_ccy][_maturity];
        } else {
            autoRollUnitPrice = AddressResolverLib
                .genesisValueVault()
                .getLatestAutoRollLog(_ccy)
                .unitPrice;
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
