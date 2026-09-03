// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// dependencies
import {IERC20} from "../../../dependencies/openzeppelin/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "../../../dependencies/openzeppelin/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "../../../dependencies/openzeppelin/utils/math/Math.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/utils/math/SafeCast.sol";
import {Strings} from "../../../dependencies/openzeppelin/utils/Strings.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
import {AutoRollLog} from "../../interfaces/IGenesisValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "../BokkyPooBahsDateTimeLibrary.sol";
import {Constants} from "../Constants.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
import {RoundingInt256} from "../math/RoundingInt256.sol";
import {FundManagementLogic} from "./FundManagementLogic.sol";
import {ItayoseFinalizeResult, ItayoseProcessStatus, ItayoseSettlementResult} from "./OrderBookLogic.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage, ZCTokenInfo, TerminationCurrencyCache, ObservationPeriodLog} from "../../storages/LendingMarketControllerStorage.sol";
import {ItayoseLog} from "../../storages/LendingMarketStorage.sol";

library LendingMarketOperationLogic {
    using SafeCast for uint256;
    using RoundingUint256 for uint256;
    using RoundingInt256 for int256;

    uint256 public constant OBSERVATION_PERIOD = 6 hours;
    uint8 public constant COMPOUND_FACTOR_DECIMALS = 18;
    uint8 public constant ZC_TOKEN_BASE_DECIMALS = 26;
    uint256 public constant PRE_ORDER_BASE_PERIOD = 7 days;
    uint256 public constant UNIT_PRICE_RANGE = 1000;

    error InvalidCompoundFactor();
    error InvalidCurrency();
    error TooManyTokenDecimals(address tokenAddress, uint8 decimals);
    error InvalidOpeningDate();
    error InvalidPreOpeningDate();
    error InvalidTimestamp();
    error InvalidMinDebtUnitPrice();
    error InvalidOrderUnitPrice(uint256 unitPrice, uint256 minUnitPrice, uint256 maxUnitPrice);
    error IncompleteItayoseProcess(bytes32 ccy, uint256 maturity, ItayoseProcessStatus status);
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

    event ItayoseProcessInitialized(
        bytes32 indexed ccy,
        uint256 indexed maturity,
        uint256 openingUnitPrice,
        uint256 lastLendUnitPrice,
        uint256 lastBorrowUnitPrice,
        uint256 totalOffsetAmount
    );

    event ItayoseSettlementProgress(
        bytes32 indexed ccy,
        uint256 indexed maturity,
        ProtocolTypes.Side makerSide,
        uint256 batchFilledAmount,
        uint256 remainingLendOffsetAmount,
        uint256 remainingBorrowOffsetAmount
    );

    event ItayoseProcessFinalized(bytes32 indexed ccy, uint256 indexed maturity);

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

        address tokenAddress = AddressResolverLib.tokenVault().getTokenAddress(_ccy);
        uint8 tokenDecimals = IERC20Metadata(tokenAddress).decimals();

        if (tokenDecimals > COMPOUND_FACTOR_DECIMALS + ZC_TOKEN_BASE_DECIMALS) {
            revert TooManyTokenDecimals(tokenAddress, tokenDecimals);
        }

        AddressResolverLib.genesisValueVault().initializeCurrencySetting(
            _ccy,
            COMPOUND_FACTOR_DECIMALS + ZC_TOKEN_BASE_DECIMALS - tokenDecimals,
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
        createZCToken(_ccy, 0, tokenAddress);

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
        if (_minDebtUnitPrice > Constants.PRICE_DIGIT) {
            revert InvalidMinDebtUnitPrice();
        }

        Storage.slot().minDebtUnitPrices[_ccy] = _minDebtUnitPrice;
        emit MinDebtUnitPriceUpdated(_ccy, _minDebtUnitPrice);
    }

    function getOrderUnitPriceRange(
        bytes32 _ccy,
        uint256 _maturity
    )
        public
        view
        returns (
            uint256 minLendUnitPrice,
            uint256 maxLendUnitPrice,
            uint256 minBorrowUnitPrice,
            uint256 maxBorrowUnitPrice,
            uint256 referenceUnitPrice,
            bool isMinDebtUnitPriceReference
        )
    {
        uint256 minUnitPrice;
        uint256 maxUnitPrice;
        bool isPreOrderPeriod;

        (
            minUnitPrice,
            maxUnitPrice,
            referenceUnitPrice,
            isPreOrderPeriod,
            isMinDebtUnitPriceReference
        ) = _getBaseOrderUnitPriceRange(_ccy, _maturity);

        maxLendUnitPrice = maxUnitPrice;
        minBorrowUnitPrice = minUnitPrice;

        if (isPreOrderPeriod) {
            minLendUnitPrice = minUnitPrice;
            maxBorrowUnitPrice = maxUnitPrice;
        } else {
            minLendUnitPrice = 1;
            maxBorrowUnitPrice = Constants.PRICE_DIGIT;
        }
    }

    function _getBaseOrderUnitPriceRange(
        bytes32 _ccy,
        uint256 _maturity
    )
        private
        view
        returns (
            uint256 minUnitPrice,
            uint256 maxUnitPrice,
            uint256 referenceUnitPrice,
            bool isPreOrderPeriod,
            bool isMinDebtUnitPriceReference
        )
    {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];
        (, , uint256 openingDate, ) = market.getOrderBookDetail(orderBookId);
        isPreOrderPeriod = market.isPreOrderPeriod(orderBookId);

        if (isPreOrderPeriod) {
            (bool hasPreviousOpening, uint256 convertedUnitPrice) = _getPreviousOpeningUnitPrice(
                _ccy,
                _maturity,
                openingDate,
                orderBookId,
                market
            );

            if (hasPreviousOpening) {
                referenceUnitPrice = convertedUnitPrice;
                minUnitPrice = convertedUnitPrice > UNIT_PRICE_RANGE
                    ? convertedUnitPrice - UNIT_PRICE_RANGE
                    : 1;
                maxUnitPrice = Math.min(
                    Constants.PRICE_DIGIT,
                    convertedUnitPrice + UNIT_PRICE_RANGE
                );
                return (minUnitPrice, maxUnitPrice, referenceUnitPrice, isPreOrderPeriod, false);
            }
        } else {
            uint256 marketUnitPrice = market.getMarketUnitPrice(orderBookId);
            if (marketUnitPrice != 0) {
                referenceUnitPrice = marketUnitPrice;
                minUnitPrice = marketUnitPrice > UNIT_PRICE_RANGE
                    ? marketUnitPrice - UNIT_PRICE_RANGE
                    : 1;
                maxUnitPrice = Math.min(Constants.PRICE_DIGIT, marketUnitPrice + UNIT_PRICE_RANGE);
                return (minUnitPrice, maxUnitPrice, referenceUnitPrice, isPreOrderPeriod, false);
            }
        }

        (minUnitPrice, maxUnitPrice, referenceUnitPrice) = _getMinDebtUnitPriceRange(
            _ccy,
            _maturity,
            openingDate
        );
        isMinDebtUnitPriceReference = true;
    }

    function getItayoseProcessStatus(
        bytes32 _ccy,
        uint256 _maturity
    ) public view returns (ItayoseProcessStatus memory) {
        return
            ILendingMarket(Storage.slot().lendingMarkets[_ccy]).getItayoseProcessStatus(
                Storage.slot().maturityOrderBookIds[_ccy][_maturity]
            );
    }

    function validateOrderUnitPrice(
        bytes32 _ccy,
        uint256 _maturity,
        ProtocolTypes.Side _side,
        uint256 _unitPrice
    ) external view {
        if (_unitPrice == 0) return;

        uint256 minUnitPrice;
        uint256 maxUnitPrice;
        if (_side == ProtocolTypes.Side.LEND) {
            (minUnitPrice, maxUnitPrice, , , , ) = getOrderUnitPriceRange(_ccy, _maturity);
        } else {
            (, , minUnitPrice, maxUnitPrice, , ) = getOrderUnitPriceRange(_ccy, _maturity);
        }

        if (_unitPrice < minUnitPrice || _unitPrice > maxUnitPrice) {
            revert InvalidOrderUnitPrice(_unitPrice, minUnitPrice, maxUnitPrice);
        }
    }

    function _getPreviousOpeningUnitPrice(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _openingDate,
        uint8 _orderBookId,
        ILendingMarket _market
    ) private view returns (bool hasPreviousOpening, uint256 convertedUnitPrice) {
        // Only the immediately preceding active order book is eligible as the reference.
        // Its Itayose must be finalized before the next order book enters the pre-order period.
        // If it is not finalized, do not scan older order books: fall back to the min-debt range
        // to avoid using a stale opening price and performing additional external storage reads.
        uint8[] storage orderBookIds = Storage.slot().orderBookIdLists[_ccy];
        uint8 previousOrderBookId;

        for (uint256 i; i < orderBookIds.length; i++) {
            if (orderBookIds[i] == _orderBookId) {
                if (i != 0) previousOrderBookId = orderBookIds[i - 1];
                break;
            }
        }

        if (previousOrderBookId == 0 || !_market.isReady(previousOrderBookId)) {
            return (false, 0);
        }

        (, uint256 previousMaturity, uint256 previousOpeningDate, ) = _market.getOrderBookDetail(
            previousOrderBookId
        );
        ItayoseLog memory previousLog = _market.getItayoseLog(previousMaturity);

        if (
            previousLog.openingUnitPrice == 0 ||
            previousMaturity <= previousOpeningDate ||
            _maturity <= _openingDate
        ) return (false, 0);

        uint256 sourceDuration = previousMaturity - previousOpeningDate;
        uint256 destinationDuration = _maturity - _openingDate;
        uint256 previousOpeningUnitPrice = previousLog.openingUnitPrice;

        convertedUnitPrice =
            (Constants.PRICE_DIGIT * previousOpeningUnitPrice * sourceDuration) /
            (((Constants.PRICE_DIGIT - previousOpeningUnitPrice) * destinationDuration) +
                (previousOpeningUnitPrice * sourceDuration));
        if (convertedUnitPrice == 0) convertedUnitPrice = 1;
        if (convertedUnitPrice > Constants.PRICE_DIGIT) {
            convertedUnitPrice = Constants.PRICE_DIGIT;
        }
        hasPreviousOpening = true;
    }

    function _getMinDebtUnitPriceRange(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _openingDate
    )
        private
        view
        returns (uint256 minUnitPrice, uint256 maxUnitPrice, uint256 referenceUnitPrice)
    {
        referenceUnitPrice = FundManagementLogic.getMinDebtUnitPriceAt(
            _maturity,
            Storage.slot().minDebtUnitPrices[_ccy],
            _openingDate
        );
        if (referenceUnitPrice == 0) referenceUnitPrice = 1;

        minUnitPrice = referenceUnitPrice;
        maxUnitPrice = Math.min(Constants.PRICE_DIGIT, referenceUnitPrice + UNIT_PRICE_RANGE * 2);
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

        address tokenAddress = AddressResolverLib.tokenVault().getTokenAddress(_ccy);
        createZCToken(_ccy, newMaturity, tokenAddress);

        emit OrderBookCreated(_ccy, orderBookId, _openingDate, _preOpeningDate, newMaturity);
    }

    function executeItayoseCall(bytes32 _ccy, uint256 _maturity) external {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];
        ItayoseProcessStatus memory status = market.getItayoseProcessStatus(orderBookId);

        if (!status.isInProgress) {
            status = _initializeItayose(_ccy, _maturity, market, orderBookId);
        }

        while (status.remainingBorrowOffsetAmount > 0 || status.remainingLendOffsetAmount > 0) {
            ItayoseSettlementResult memory settlement = _executeItayoseSettlement(
                _ccy,
                _maturity,
                market,
                orderBookId
            );
            status.remainingLendOffsetAmount = settlement.remainingLendOffsetAmount;
            status.remainingBorrowOffsetAmount = settlement.remainingBorrowOffsetAmount;
        }

        _finalizeItayose(_ccy, _maturity, market, orderBookId);
    }

    function executeItayoseStep(bytes32 _ccy, uint256 _maturity) public returns (bool completed) {
        ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[_ccy]);
        uint8 orderBookId = Storage.slot().maturityOrderBookIds[_ccy][_maturity];
        ItayoseProcessStatus memory status = market.getItayoseProcessStatus(orderBookId);

        if (!status.isInProgress) {
            _initializeItayose(_ccy, _maturity, market, orderBookId);
        } else if (status.remainingBorrowOffsetAmount > 0 || status.remainingLendOffsetAmount > 0) {
            _executeItayoseSettlement(_ccy, _maturity, market, orderBookId);
        } else {
            _finalizeItayose(_ccy, _maturity, market, orderBookId);
            completed = true;
        }
    }

    function _initializeItayose(
        bytes32 _ccy,
        uint256 _maturity,
        ILendingMarket _market,
        uint8 _orderBookId
    ) private returns (ItayoseProcessStatus memory status) {
        status = _market.initializeItayose(_orderBookId);

        emit ItayoseProcessInitialized(
            _ccy,
            _maturity,
            status.openingUnitPrice,
            status.lastLendUnitPrice,
            status.lastBorrowUnitPrice,
            status.totalOffsetAmount
        );
    }

    function _executeItayoseSettlement(
        bytes32 _ccy,
        uint256 _maturity,
        ILendingMarket _market,
        uint8 _orderBookId
    ) private returns (ItayoseSettlementResult memory result) {
        result = _market.executeItayoseSettlement(_orderBookId);

        // The partial maker is accounted for immediately, while full orders remain in
        // pendingOrderAmounts until their owners run lazy cleanup.
        Storage.slot().pendingOrderAmounts[_ccy][_maturity] +=
            result.batchFilledAmount -
            result.partiallyFilledOrder.amount;
        FundManagementLogic.updateFundsForMaker(
            _ccy,
            _maturity,
            result.makerSide,
            result.partiallyFilledOrder
        );

        emit ItayoseSettlementProgress(
            _ccy,
            _maturity,
            result.makerSide,
            result.batchFilledAmount,
            result.remainingLendOffsetAmount,
            result.remainingBorrowOffsetAmount
        );
    }

    function _finalizeItayose(
        bytes32 _ccy,
        uint256 _maturity,
        ILendingMarket _market,
        uint8 _orderBookId
    ) private {
        ItayoseFinalizeResult memory result = _market.finalizeItayose(_orderBookId);

        if (
            result.openingUnitPrice > 0 && Storage.slot().orderBookIdLists[_ccy][0] == _orderBookId
        ) {
            uint256 convertedUnitPrice = _convertUnitPrice(
                result.openingUnitPrice,
                _maturity,
                result.openingDate,
                Storage.slot().genesisDates[_ccy]
            );

            AddressResolverLib.genesisValueVault().updateInitialCompoundFactor(
                _ccy,
                convertedUnitPrice
            );
        }

        emit ItayoseProcessFinalized(_ccy, _maturity);
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

        _requireItayoseComplete(_ccy, market, maturedOrderBookId);
        _requireItayoseComplete(_ccy, market, destinationOrderBookId);

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
        bytes32[] memory currencies = AddressResolverLib.currencyController().getCurrencies();
        for (uint256 i; i < currencies.length; i++) {
            bytes32 ccy = currencies[i];
            ILendingMarket market = ILendingMarket(Storage.slot().lendingMarkets[ccy]);
            uint8[] storage orderBookIds = Storage.slot().orderBookIdLists[ccy];

            for (uint256 j; j < orderBookIds.length; j++) {
                _requireNoItayoseInProgress(ccy, market, orderBookIds[j]);
            }
        }

        Storage.slot().terminationDate = block.timestamp;

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

    function _requireItayoseComplete(
        bytes32 _ccy,
        ILendingMarket _market,
        uint8 _orderBookId
    ) private view {
        ItayoseProcessStatus memory status = _market.getItayoseProcessStatus(_orderBookId);

        if (status.isInProgress || (!status.isReady && _market.isItayosePeriod(_orderBookId))) {
            revert IncompleteItayoseProcess(_ccy, _market.getMaturity(_orderBookId), status);
        }
    }

    function _requireNoItayoseInProgress(
        bytes32 _ccy,
        ILendingMarket _market,
        uint8 _orderBookId
    ) private view {
        ItayoseProcessStatus memory status = _market.getItayoseProcessStatus(_orderBookId);

        if (status.isInProgress) {
            revert IncompleteItayoseProcess(_ccy, _market.getMaturity(_orderBookId), status);
        }
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
        uint8[] storage orderBookIds = Storage.slot().orderBookIdLists[_ccy];

        if (orderBookIds.length >= 2 && orderBookIds[1] == orderBookId) {
            uint256 nearestMaturity = ILendingMarket(Storage.slot().lendingMarkets[_ccy])
                .getMaturity(orderBookIds[0]);

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

    function createZCToken(bytes32 _ccy, uint256 _maturity, address _tokenAddress) public {
        if (Storage.slot().zcTokens[_ccy][_maturity] != address(0)) {
            revert AlreadyZCTokenExists(Storage.slot().zcTokens[_ccy][_maturity]);
        }

        if (_maturity != 0 && Storage.slot().maturityOrderBookIds[_ccy][_maturity] == 0) {
            revert InvalidMaturity(_maturity);
        }

        string memory tokenSymbol = bytes32ToString(_ccy);

        string memory symbol = string.concat("zc", tokenSymbol);
        string memory name = string.concat("ZC ", tokenSymbol);
        // NOTE: The amount of genesis value generated gradually decreases as the compound factor increases.
        // The values of ZCToken decimals are subtracted by 2 to prevent the display from becoming too small.
        // Therefore, if the lending position is 1ETH and the compound factor is 10^18, the amount of ZCToken
        // will be 100zcETH.
        uint8 decimals = ZC_TOKEN_BASE_DECIMALS - 2;

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
            decimals = IERC20Metadata(_tokenAddress).decimals();
        }

        address zcToken = AddressResolverLib.beaconProxyController().deployZCToken(
            name,
            symbol,
            decimals,
            _tokenAddress,
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

    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        uint256 i = 0;
        while (i < 32 && _bytes32[i] != 0) {
            i++;
        }

        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }

        return string(bytesArray);
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
