import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import moment from 'moment';

import { getBasisDate } from '../utils/dates';
import { currencies, executeIfNewlyDeployment } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('LendingMarket', { from: deployer });

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  // Get contracts from proxyController
  const beaconProxyController = await proxyController
    .getAddress(toBytes32('BeaconProxyController'))
    .then((address) => ethers.getContractAt('BeaconProxyController', address));
  const lendingMarketController = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );

  await executeIfNewlyDeployment('LendingMarket', deployResult, async () => {
    await beaconProxyController
      .setLendingMarketImpl(deployResult.address)
      .then((tx) => tx.wait());
  });

  const MARKET_COUNT = 8;

  for (const currency of currencies) {
    const isInitialized =
      await lendingMarketController.isInitializedLendingMarket(currency.key);

    if (!isInitialized) {
      let basisDate = process.env.MARKET_BASIS_DATE;

      if (!basisDate) {
        // basisDate will be 1st of Mar, Jun, Sep, or Dec.
        basisDate = getBasisDate().toString();
      }

      await lendingMarketController
        .initializeLendingMarket(
          currency.key,
          basisDate,
          process.env.INITIAL_COMPOUND_FACTOR,
        )
        .then((tx) => tx.wait());
    }

    const lendingMarkets = await lendingMarketController
      .getLendingMarkets(currency.key)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );

    const market: Record<string, string>[] = [];

    if (lendingMarkets.length >= MARKET_COUNT) {
      console.log(`Skipped deploying ${currency.symbol} lending markets`);
      for (let i = 0; i < lendingMarkets.length; i++) {
        const { maturity } = await lendingMarkets[i].getMarket();
        market.push({
          Address: lendingMarkets[i].address,
          Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
        });
      }
    } else {
      const count = MARKET_COUNT - lendingMarkets.length;

      for (let i = 0; i < count; i++) {
        const receipt = await lendingMarketController
          .createLendingMarket(currency.key)
          .then((tx) => tx.wait());

        const { marketAddr, maturity } = receipt.events.find(
          ({ event }) => event === 'LendingMarketCreated',
        ).args;
        market.push({
          Address: marketAddr,
          Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
        });
      }
      console.log(`Deployed ${currency.symbol} lending markets:`);
    }
    console.table(market);
  }
};

func.tags = ['LendingMarkets'];
func.dependencies = [
  'BeaconProxyController',
  'LendingMarketController',
  'Migration',
];

export default func;
