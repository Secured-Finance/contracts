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

  for (const currency of currencies) {
    const lendingMarket = await lendingMarketController
      .getLendingMarket(currency)
      .then((address) => ethers.getContractAt('LendingMarket', address));
    const maturities = await lendingMarketController.getMaturities(currency);

    for (const maturity of maturities) {
      const [isItayosePeriod, isMatured] = await Promise.all([
        lendingMarket.isItayosePeriod(maturity),
        lendingMarket.isMatured(maturity),
      ]);

      if (isItayosePeriod) {
        await lendingMarketController.executeItayoseCall(currency, maturity);
        console.log(
          `Successfully executed ${fromBytes32(
            currency,
          )} market Itayose call with maturity ${maturity}`,
        );
      }

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
    const maturities = await lendingMarketController.getMaturities(currency);

    for (const maturity of maturities) {
      const openingDate = await lendingMarket.getOpeningDate(maturity);

      marketLog.push({
        'Maturity(UnixTime)': maturity.toString(),
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
