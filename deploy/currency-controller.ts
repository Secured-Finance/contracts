import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies, mockRates, priceOracles } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('CurrencyController', {
    from: deployer,
  });

  await executeIfNewlyDeployment(
    'CurrencyController',
    deployResult,
    async () => {
      // Set up for Proxies
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      const { events } = await proxyController
        .setCurrencyControllerImpl(deployResult.address)
        .then((tx) => tx.wait());

      const proxyAddress = events.find(({ event }) =>
        ['ProxyCreated', 'ProxyUpdated'].includes(event),
      ).args.proxyAddress;

      const currencyControllerContract = await ethers.getContractAt(
        'CurrencyController',
        proxyAddress,
      );

      // Set up for CurrencyController
      const priceFeeds: Record<string, DeployResult> = {};

      const currencyKeyMap = {};
      currencies.forEach((c) => (currencyKeyMap[c.key] = c));
      for (const rate of mockRates) {
        if (!currencyKeyMap[rate.key].env || !priceOracles[rate.key]) {
          const priceFeed = await deploy('MockV3Aggregator', {
            from: deployer,
            args: [rate.decimals, rate.key, rate.rate.toString()],
          });
          console.log(
            `Deployed MockV3Aggregator ${rate.name} price feed at`,
            priceFeed.address,
          );
          priceFeeds[rate.key] = priceFeed;
        }
      }

      for (const currency of currencies) {
        const priceFeedAddress =
          currency.env && priceOracles[currency.key]
            ? priceOracles[currency.key]
            : priceFeeds[currency.key].address;
        await currencyControllerContract
          .addCurrency(currency.key, priceFeedAddress, currency.haircut)
          .then((tx) => tx.wait());
        console.log(
          `${currency.symbol} refers to ${
            priceFeedAddress === priceOracles[currency.key]
              ? 'External Oracle'
              : 'MockV3Aggregator'
          } at`,
          priceFeedAddress,
        );
      }
    },
  );
};

func.tags = ['CurrencyController'];
func.dependencies = ['ProxyController'];

export default func;
