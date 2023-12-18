import { Contract } from 'ethers';
import moment from 'moment';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  ORDER_FEE_RATE,
} from '../utils/constants';
import { fromBytes32 } from './strings';

// NOTE: Active markets are 8.
// The last market is a inactive market for Itayose.
const MARKET_COUNT = Number(process.env.TOTAL_MARKET_COUNT || 8) + 1;
const INITIAL_MARKET_COUNT = Number(
  process.env.INITIAL_MARKET_COUNT || MARKET_COUNT,
);
const OPENING_DATE_INTERVAL = Number(process.env.OPENING_DATE_INTERVAL || 0);
const DEFAULT_PRE_ORDER_PERIOD = 604800;

interface MulticallInput {
  functionName: string;
  args: any[];
  callData: string;
}

const getMulticallOrderBookInputs = async (
  lendingMarketController: Contract,
  currencyKey: string,
  minDebtUnitPrice: number,
  genesisDate: number,
  initialOpeningDate?: number,
  initialPreOpeningDate?: number,
) => {
  const multicallInputs: MulticallInput[] = [];
  const isInitialized =
    await lendingMarketController.isInitializedLendingMarket(currencyKey);

  if (!isInitialized) {
    const args = [
      currencyKey,
      genesisDate,
      process.env.INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
      minDebtUnitPrice,
    ];

    multicallInputs.push({
      functionName: 'initializeLendingMarket',
      args,
      callData: lendingMarketController.interface.encodeFunctionData(
        'initializeLendingMarket',
        args,
      ),
    });
  }

  const maturities = isInitialized
    ? await lendingMarketController.getMaturities(currencyKey)
    : [];

  if (maturities.length > 0) {
    console.log(
      `Skipped deploying ${maturities.length} ${fromBytes32(
        currencyKey,
      )} lending markets`,
    );
  }

  if (maturities.length < MARKET_COUNT) {
    const count = MARKET_COUNT - maturities.length;
    let nearestMaturity: number;

    if (maturities[0]) {
      nearestMaturity = maturities[0].toNumber();
    } else {
      const marketBasePeriod =
        await lendingMarketController.getMarketBasePeriod();

      nearestMaturity = marketBasePeriod.eq(0)
        ? moment.unix(genesisDate).add(7, 'd').unix()
        : moment.unix(genesisDate).add(marketBasePeriod.toNumber(), 'M').unix();
    }

    for (let i = 0; i < count; i++) {
      const openingDateDelay =
        maturities.length + i >= INITIAL_MARKET_COUNT
          ? (maturities.length + i + 1 - INITIAL_MARKET_COUNT) *
            OPENING_DATE_INTERVAL
          : 0;

      const openingDate =
        i === count - 1
          ? nearestMaturity
          : (initialOpeningDate || genesisDate) + openingDateDelay;

      const preOpeningDate =
        openingDateDelay === 0
          ? initialPreOpeningDate || openingDate - DEFAULT_PRE_ORDER_PERIOD
          : openingDate - DEFAULT_PRE_ORDER_PERIOD;

      const args = [currencyKey, openingDate, preOpeningDate];

      multicallInputs.push({
        functionName: 'createOrderBook',
        args,
        callData: lendingMarketController.interface.encodeFunctionData(
          'createOrderBook',
          args,
        ),
      });
    }
  }

  return multicallInputs;
};

export { getMulticallOrderBookInputs };
