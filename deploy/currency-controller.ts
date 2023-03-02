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
      const mockPriceFeeds: Record<string, DeployResult> = {};

      // Use MockV3Aggregator for a currency when a price feed is not set
      for (const currency of currencies) {
        if (!priceOracles[currency.key]) {
          const rate = mockRates[currency.key];
          const priceFeed = await deploy('MockV3Aggregator', {
            from: deployer,
            args: [rate.decimals, currency.key, rate.rate.toString()],
          });
          console.log(
            `Deployed MockV3Aggregator ${rate.name} price feed at`,
            priceFeed.address,
          );
          mockPriceFeeds[currency.key] = priceFeed;
        }

        const priceFeedAddress = mockPriceFeeds[currency.key]
          ? mockPriceFeeds[currency.key].address
          : priceOracles[currency.key];
        await currencyControllerContract
          .addCurrency(currency.key, priceFeedAddress, currency.haircut)
          .then((tx) => tx.wait());
      }
    },
  );
};

func.tags = ['CurrencyController'];
func.dependencies = ['ProxyController'];

export default func;
