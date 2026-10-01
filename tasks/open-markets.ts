import { Contract } from 'ethers';
import { task } from 'hardhat/config';
import moment from 'moment';
import { fromBytes32, toBytes32 } from '../utils/strings';

task(
  'open-markets',
  'Execute Itayose calls and auto-rolls to open the markets',
).setAction(async (_, { deployments, ethers }) => {
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const contracts = ['CurrencyController', 'LendingMarketController'];

  const [currencyController, lendingMarketController]: Contract[] =
    await Promise.all(
      contracts.map((contract) =>
        proxyController
          .getAddress(toBytes32(contract))
          .then((address: string) => ethers.getContractAt(contract, address)),
      ),
    );

  const currencies: string[] = await currencyController.getCurrencies();

  const markets = await Promise.all(
    currencies.map(async (currency) => {
      const lendingMarket: Contract = await lendingMarketController
        .getLendingMarket(currency)
        .then((address) => ethers.getContractAt('LendingMarket', address));
      const orderBookIds = await lendingMarketController.getOrderBookIds(
        currency,
      );

      return { currency, lendingMarket, orderBookIds };
    }),
  );

  // Complete every due Itayose before rotating any order book. A rotation also
  // validates its destination order book, which may appear later in this list.
  for (const { currency, lendingMarket, orderBookIds } of markets) {
    for (const orderBookId of orderBookIds) {
      const [isItayosePeriod, maturity] = await Promise.all([
        lendingMarket.isItayosePeriod(orderBookId),
        lendingMarket.getMaturity(orderBookId),
      ]);

      if (isItayosePeriod) {
        await lendingMarketController
          .executeItayoseCall(currency, maturity)
          .then((tx) => tx.wait());
        console.log(
          `Successfully executed ${fromBytes32(
            currency,
          )} market Itayose call with maturity ${maturity}`,
        );
      }
    }
  }

  for (const { currency, lendingMarket, orderBookIds } of markets) {
    for (const orderBookId of orderBookIds) {
      const [isMatured, maturity] = await Promise.all([
        lendingMarket.isMatured(orderBookId),
        lendingMarket.getMaturity(orderBookId),
      ]);

      if (isMatured) {
        await lendingMarketController
          .rotateOrderBooks(currency)
          .then((tx) => tx.wait());
        console.log(
          `Successfully executed ${fromBytes32(
            currency,
          )} market auto-roll with maturity ${maturity}`,
        );
      }
    }
  }

  for (const currency of currencies) {
    const marketLog: Record<string, string | undefined>[] = [];
    const lendingMarket = await lendingMarketController
      .getLendingMarket(currency)
      .then((address) => ethers.getContractAt('LendingMarket', address));
    const orderBookIds = await lendingMarketController.getOrderBookIds(
      currency,
    );

    for (const orderBookId of orderBookIds) {
      const [maturity, openingDate] = await Promise.all([
        lendingMarket.getMaturity(orderBookId),
        lendingMarket.getOpeningDate(orderBookId),
      ]);

      marketLog.push({
        OrderBookID: orderBookId,
        OpeningDate: moment
          .unix(openingDate.toString())
          .format('LLL')
          .toString(),
        Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
      });
    }
    console.log(`Current ${fromBytes32(currency)} lending markets:`);
    console.table(marketLog);
  }
});
