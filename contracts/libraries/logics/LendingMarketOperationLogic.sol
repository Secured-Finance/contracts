// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
// interfaces
import {ILendingMarket} from "../../interfaces/ILendingMarket.sol";
import {IFutureValueVault} from "../../interfaces/IFutureValueVault.sol";
// libraries
import {AddressResolverLib} from "../AddressResolverLib.sol";
import {BokkyPooBahsDateTimeLibrary as TimeLibrary} from "../../libraries/BokkyPooBahsDateTimeLibrary.sol";
import {RoundingUint256} from "../math/RoundingUint256.sol";
// types
import {ProtocolTypes} from "../../types/ProtocolTypes.sol";
// storages
import {LendingMarketControllerStorage as Storage, ObservationPeriodLog} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketOperationLogic {
    using RoundingUint256 for uint256;
    using SafeCast for uint256;

    function initializeCurrencySetting(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor
    ) external {
        AddressResolverLib.genesisValueVault().initializeCurrencySetting(
            _ccy,
            36,
            _compoundFactor,
            calculateNextMaturity(_genesisDate, Storage.slot().marketBasePeriod)
        );

        Storage.slot().genesisDates[_ccy] = _genesisDate;
    }

    function createLendingMarket(bytes32 _ccy, uint256 _openingDate)
        external
        returns (
            address market,
            address futureValueVault,
            uint256 maturity
        )
    {
        require(
            AddressResolverLib.genesisValueVault().isInitialized(_ccy),
            "Lending market hasn't been initialized in the currency"
        );
        require(
            AddressResolverLib.currencyController().currencyExists(_ccy),
            "Non supported currency"
        );

        if (Storage.slot().lendingMarkets[_ccy].length == 0) {
            maturity = AddressResolverLib.genesisValueVault().getCurrentMaturity(_ccy);
        } else {
            uint256 lastMaturity = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
            maturity = calculateNextMaturity(lastMaturity, Storage.slot().marketBasePeriod);
        }

        require(_openingDate < maturity, "Market opening date must be before maturity date");

        market = AddressResolverLib.beaconProxyController().deployLendingMarket(
            _ccy,
            maturity,
            _openingDate
        );
        futureValueVault = AddressResolverLib.beaconProxyController().deployFutureValueVault();

        Storage.slot().lendingMarkets[_ccy].push(market);
        Storage.slot().maturityLendingMarkets[_ccy][maturity] = market;
        Storage.slot().futureValueVaults[_ccy][market] = futureValueVault;
    }

    function executeItayoseCalls(bytes32[] memory _currencies, uint256 _maturity) external {
        for (uint256 i; i < _currencies.length; i++) {
            bytes32 ccy = _currencies[i];
            address marketAddr = Storage.slot().maturityLendingMarkets[ccy][_maturity];
            ILendingMarket market = ILendingMarket(marketAddr);

            if (market.isItayosePeriod()) {
                (uint256 openingUnitPrice, uint256 openingDate, uint256 filledAmount) = market
                    .executeItayoseCall();

                // Save the openingUnitPrice as first compound factor
                // if it is a first Itayose call at the nearest market.
                if (openingUnitPrice > 0 && Storage.slot().lendingMarkets[ccy][0] == marketAddr) {
                    // Convert the openingUnitPrice determined by Itayose to the unit price on the Genesis Date.
                    uint256 convertedUnitPrice = _convertUnitPrice(
                        openingUnitPrice,
                        _maturity,
                        openingDate,
                        Storage.slot().genesisDates[ccy]
                    );

                    AddressResolverLib.genesisValueVault().updateInitialCompoundFactor(
                        ccy,
                        convertedUnitPrice
                    );
                    if (filledAmount > 0) {
                        address futureValueVault = Storage.slot().futureValueVaults[ccy][
                            marketAddr
                        ];
                        IFutureValueVault(futureValueVault).addInitialTotalSupply(
                            _maturity,
                            (filledAmount * ProtocolTypes.PRICE_DIGIT)
                                .div(openingUnitPrice)
                                .toInt256()
                        );
                    }
                }
            }
        }
    }

    function rotateLendingMarkets(bytes32 _ccy, uint256 _autoRollFeeRate)
        external
        returns (uint256 fromMaturity, uint256 toMaturity)
    {
        address[] storage markets = Storage.slot().lendingMarkets[_ccy];
        address currentMarketAddr = markets[0];
        address nextMarketAddr = markets[1];
        uint256 nextMaturity = ILendingMarket(nextMarketAddr).getMaturity();

        // Reopen the market matured with new maturity
        toMaturity = calculateNextMaturity(
            ILendingMarket(markets[markets.length - 1]).getMaturity(),
            Storage.slot().marketBasePeriod
        );

        // The market that is moved to the last of the list opens again when the next market is matured.
        // Just before the opening, the moved market needs the Itayose execution.
        fromMaturity = ILendingMarket(currentMarketAddr).openMarket(toMaturity, nextMaturity);

        // Rotate the order of the market
        for (uint256 i = 0; i < markets.length; i++) {
            address marketAddr = (markets.length - 1) == i ? currentMarketAddr : markets[i + 1];
            markets[i] = marketAddr;
        }

        address futureValueVault = Storage.slot().futureValueVaults[_ccy][currentMarketAddr];

        AddressResolverLib.genesisValueVault().executeAutoRoll(
            _ccy,
            fromMaturity,
            nextMaturity,
            _calculateAutoRollUnitPrice(_ccy, nextMaturity),
            _autoRollFeeRate,
            IFutureValueVault(futureValueVault).getTotalSupply(fromMaturity)
        );

        Storage.slot().maturityLendingMarkets[_ccy][toMaturity] = currentMarketAddr;
    }

    function updateOrderLogs(
        bytes32 _ccy,
        uint256 _maturity,
        uint256 _observationPeriod,
        uint256 _filledUnitPrice,
        uint256 _filledAmount,
        uint256 _filledFutureValue
    ) external {
        if (
            Storage.slot().lendingMarkets[_ccy][1] ==
            Storage.slot().maturityLendingMarkets[_ccy][_maturity]
        ) {
            uint256 nearestMaturity = ILendingMarket(Storage.slot().lendingMarkets[_ccy][0])
                .getMaturity();

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
                (block.timestamp >= (nearestMaturity - _observationPeriod))
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

        require(lastFridayTimestamp > 0, "Invalid Timestamp");

        return lastFridayTimestamp;
    }

    function _calculateAutoRollUnitPrice(bytes32 _ccy, uint256 _maturity)
        internal
        view
        returns (uint256 autoRollUnitPrice)
    {
        ObservationPeriodLog memory log = Storage.slot().observationPeriodLogs[_ccy][_maturity];

        if (log.totalFutureValue != 0) {
            autoRollUnitPrice = (log.totalAmount * ProtocolTypes.PRICE_DIGIT).div(
                log.totalFutureValue
            );
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
            (ProtocolTypes.PRICE_DIGIT * _unitPrice * currentDuration) /
            (((ProtocolTypes.PRICE_DIGIT - _unitPrice) * destinationDuration) +
                (_unitPrice * currentDuration));
    }
}
