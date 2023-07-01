import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import moment from 'moment';

import { currencies } from '../utils/currencies';
import { getGenesisDate } from '../utils/dates';
import { executeIfNewlyDeployment } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

// NOTE: Active markets are 8.
// The last market is a inactive market for Itayose.
const MARKET_COUNT = 9;

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const genesisDate =
    Number(process.env.MARKET_BASE_PERIOD) === 0
      ? process.env.INITIAL_MARKET_OPENING_DATE || moment().unix()
      : getGenesisDate().toString();

  const orderBookLogic = await deployments.get('OrderBookLogic');
  const deployResult = await deploy('LendingMarket', {
    from: deployer,
    libraries: {
      OrderBookLogic: orderBookLogic.address,
    },
  });

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  // Get contracts from proxyController
  const beaconProxyController: Contract = await proxyController
    .getAddress(toBytes32('BeaconProxyController'))
    .then((address) => ethers.getContractAt('BeaconProxyController', address));
  const lendingMarketController: Contract = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );
  const lendingMarketOperationLogic = await deployments
    .get('LendingMarketOperationLogic')
    .then(({ address }) =>
      ethers.getContractAt('LendingMarketOperationLogic', address),
    )
    .then((contract) => contract.attach(lendingMarketController.address));

  await executeIfNewlyDeployment('LendingMarket', deployResult, async () => {
    await beaconProxyController
      .setLendingMarketImpl(deployResult.address)
      .then((tx) => tx.wait());
  });

  for (const currency of currencies) {
    const isInitialized =
      await lendingMarketController.isInitializedLendingMarket(currency.key);

    if (!isInitialized) {
      await lendingMarketController
        .initializeLendingMarket(
          currency.key,
          genesisDate,
          process.env.INITIAL_COMPOUND_FACTOR,
          currency.orderFeeRate,
          currency.circuitBreakerLimitRange,
        )
        .then((tx) => tx.wait());
    }

    const lendingMarkets: Contract[] = await lendingMarketController
      .getLendingMarkets(currency.key)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );

    const marketLog: Record<string, string | undefined>[] = [];

    if (lendingMarkets.length > 0) {
      console.log(
        `Skipped deploying ${lendingMarkets.length} ${currency.symbol} lending markets`,
      );
    }

    for (let i = 0; i < lendingMarkets.length; i++) {
      const { maturity, openingDate } = await lendingMarkets[i].getMarket();
      marketLog.push({
        [`MarketAddress(${currency.symbol})`]: lendingMarkets[i].address,
        OpeningDate: moment
          .unix(openingDate.toString())
          .format('LLL')
          .toString(),
        Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
      });
    }

    if (lendingMarkets.length < MARKET_COUNT) {
      const count = MARKET_COUNT - lendingMarkets.length;
      let nearestMaturity = await lendingMarkets[0]?.getMaturity();

      for (let i = 0; i < count; i++) {
        let openingDate =
          i === count - 1
            ? nearestMaturity.toString()
            : process.env.INITIAL_MARKET_OPENING_DATE || genesisDate;

        const receipt = await lendingMarketController
          .createLendingMarket(currency.key, openingDate)
          .then((tx) => tx.wait());

        const events = await lendingMarketOperationLogic.queryFilter(
          lendingMarketOperationLogic.filters.LendingMarketCreated(),
          receipt.blockNumber,
        );

        const args = events.find(
          ({ event }) => event === 'LendingMarketCreated',
        )?.args;

        const marketAddr = args?.marketAddr;
        const futureValueVault = args?.futureValueVault;
        const maturity = args?.maturity;

        if (!nearestMaturity && i === 0) {
          nearestMaturity = maturity;
        }

        marketLog.push({
          [`MarketAddress(${currency.symbol})`]: marketAddr,
          FutureValueVaultAddress: futureValueVault,
          OpeningDate: moment
            .unix(Number(openingDate))
            .format('LLL')
            .toString(),
          Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
        });
      }
      console.log(`Deployed ${count} ${currency.symbol} lending markets.`);
    }
    console.table(marketLog);
  }
};

func.tags = ['LendingMarkets'];
func.dependencies = [
  'BeaconProxyController',
  'FutureValueVault',
  'LendingMarketController',
  'Migration',
  'Libraries',
];

export default func;
