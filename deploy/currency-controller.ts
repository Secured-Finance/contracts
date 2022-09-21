import { DeployFunction, DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies, mockRates } from '../utils/currencies';
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

      for (const rate of mockRates) {
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

      for (const currency of currencies) {
        await currencyControllerContract
          .supportCurrency(
            currency.key,
            currency.name,
            priceFeeds[currency.key].address,
            7500,
          )
          .then((tx) => tx.wait());
      }
    },
  );
};

func.tags = ['CurrencyController'];
func.dependencies = ['ProxyController'];

export default func;
