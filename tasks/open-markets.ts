import { Contract } from 'ethers';
import { task } from 'hardhat/config';
import moment from 'moment';
import { currencies } from '../utils/currencies';
import { toBytes32 } from '../utils/strings';

task(
  'open-markets',
  'Execute Itayose calls and auto-rolls to open the markets',
).setAction(async (_, { deployments, ethers }) => {
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  const contracts = ['LendingMarketController'];

  const [lendingMarketController]: Contract[] = await Promise.all(
    contracts.map((contract) =>
      proxyController
        .getAddress(toBytes32(contract))
        .then((address: string) => ethers.getContractAt(contract, address)),
    ),
  );

  const getLendingMarkets = (currency: string): Promise<Contract[]> =>
    lendingMarketController
      .getLendingMarkets(currency)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );

  for (const currency of currencies) {
    const lendingMarkets = await getLendingMarkets(currency.key);

    for (const lendingMarket of lendingMarkets) {
      const [isItayosePeriod, isMatured, maturity] = await Promise.all([
        lendingMarket.isItayosePeriod(),
        lendingMarket.isMatured(),
        lendingMarket.getMaturity(),
      ]);

      if (isItayosePeriod) {
        await lendingMarketController.executeItayoseCalls(
          [currency.key],
          maturity,
        );
        console.log(
          `Successfully executed ${currency.symbol} market Itayose call with maturity ${maturity}`,
        );
      }

      if (isMatured) {
        await lendingMarketController
          .rotateLendingMarkets(currency)
          .then((tx) => tx.wait());
        console.log(
          `Successfully executed ${currency.symbol} market auto-roll with maturity ${maturity}`,
        );
      }
    }
  }

  for (const currency of currencies) {
    const marketLog: Record<string, string | undefined>[] = [];
    const lendingMarkets = await getLendingMarkets(currency.key);
    for (const lendingMarket of lendingMarkets) {
      const [maturity, openingDate] = await Promise.all([
        lendingMarket.getMaturity(),
        lendingMarket.getOpeningDate(),
      ]);

      marketLog.push({
        MarketAddress: lendingMarket.address,
        OpeningDate: moment
          .unix(openingDate.toString())
          .format('LLL')
          .toString(),
        Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
      });
    }
    console.log(`Current ${currency.symbol} lending markets:`);
    console.table(marketLog);
  }
});
