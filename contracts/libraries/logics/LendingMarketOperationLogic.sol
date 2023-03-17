// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
import {LendingMarketControllerStorage as Storage, TotalAmount} from "../../storages/LendingMarketControllerStorage.sol";

library LendingMarketOperationLogic {
    using RoundingUint256 for uint256;

    function initializeCurrencySetting(
        bytes32 _ccy,
        uint256 _genesisDate,
        uint256 _compoundFactor
    ) external {
        AddressResolverLib.genesisValueVault().initializeCurrencySetting(
            _ccy,
            36,
            _compoundFactor,
            TimeLibrary.addMonths(_genesisDate, ProtocolTypes.BASIS_TERM)
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

        uint256 basisDate = Storage.slot().genesisDates[_ccy];

        if (Storage.slot().lendingMarkets[_ccy].length > 0) {
            basisDate = ILendingMarket(
                Storage.slot().lendingMarkets[_ccy][Storage.slot().lendingMarkets[_ccy].length - 1]
            ).getMaturity();
        }

        maturity = TimeLibrary.addMonths(basisDate, ProtocolTypes.BASIS_TERM);
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

    function executeMultiItayoseCall(bytes32[] memory _currencies, uint256 _maturity) external {
        for (uint256 i; i < _currencies.length; i++) {
            ILendingMarket market = ILendingMarket(
                Storage.slot().maturityLendingMarkets[_currencies[i]][_maturity]
            );
            if (market.isItayosePeriod()) {
                uint256 openingUnitPrice = market.executeItayoseCall();
                Storage.slot().latestFilledUnitPrice[_currencies[i]][_maturity] = openingUnitPrice;
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
        toMaturity = TimeLibrary.addMonths(
            ILendingMarket(markets[markets.length - 1]).getMaturity(),
            ProtocolTypes.BASIS_TERM
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
            if (Storage.slot().totalAmountsForObservePeriod[_ccy][_maturity].amount == 0) {
                Storage.slot().latestFilledUnitPrice[_ccy][_maturity] = _filledUnitPrice;
            }

            uint256 nearestMaturity = ILendingMarket(Storage.slot().lendingMarkets[_ccy][0])
                .getMaturity();

            if (
                (block.timestamp < nearestMaturity) &&
                (block.timestamp >= (nearestMaturity - _observationPeriod))
            ) {
                Storage
                .slot()
                .totalAmountsForObservePeriod[_ccy][_maturity].amount += _filledAmount;
                Storage
                .slot()
                .totalAmountsForObservePeriod[_ccy][_maturity].futureValue += _filledFutureValue;
            }
        }
    }

    function _calculateAutoRollUnitPrice(bytes32 _ccy, uint256 _maturity)
        internal
        view
        returns (uint256 autoRollUnitPrice)
    {
        TotalAmount memory totalAmount = Storage.slot().totalAmountsForObservePeriod[_ccy][
            _maturity
        ];

        if (totalAmount.futureValue != 0) {
            autoRollUnitPrice = (totalAmount.amount * ProtocolTypes.PRICE_DIGIT).div(
                totalAmount.futureValue
            );
        } else if (Storage.slot().latestFilledUnitPrice[_ccy][_maturity] != 0) {
            autoRollUnitPrice = Storage.slot().latestFilledUnitPrice[_ccy][_maturity];
        } else {
            autoRollUnitPrice = AddressResolverLib
                .genesisValueVault()
                .getLatestAutoRollLog(_ccy)
                .unitPrice;
        }
    }
}
