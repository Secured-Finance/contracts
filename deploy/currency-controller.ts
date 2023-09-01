import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies, mockPriceFeeds } from '../utils/currencies';
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

      // Use MockV3Aggregator for a currency when a price feed is not set
      for (const currency of currencies) {
        const priceFeedAddresses = currency.priceFeed.addresses.filter(Boolean);
        let heartbeat = 0;
        let decimals = 0;

        if (priceFeedAddresses.length === 0) {
          for (const priceFeed of mockPriceFeeds[currency.key]) {
            const priceFeedContract = await deploy('MockV3Aggregator', {
              from: deployer,
              args: [priceFeed.decimals, currency.key, priceFeed.mockRate],
            });
            console.log(
              `Deployed MockV3Aggregator ${priceFeed.name} price feed at`,
              priceFeedContract.address,
            );

            priceFeedAddresses.push(priceFeedContract.address);

            if (heartbeat < priceFeed.heartbeat) {
              heartbeat = priceFeed.heartbeat;
            }
          }
        } else {
          heartbeat = currency.priceFeed.heartbeat;
        }

        const tokenContract = await ethers.getContractAt(
          currency.mock,
          currency.env || (await deployments.get(currency.mock)).address,
        );

        for (let i = 0; i < priceFeedAddresses.length; i++) {
          if (i === 0) {
            decimals += await tokenContract.decimals();
          } else {
            const priceFeedContract = await ethers.getContractAt(
              'MockV3Aggregator',
              priceFeedAddresses[i - 1],
            );
            decimals += await priceFeedContract.decimals();
          }
        }

        await currencyControllerContract
          .addCurrency(
            currency.key,
            decimals,
            currency.haircut,
            priceFeedAddresses,
            heartbeat,
          )
          .then((tx) => tx.wait());
      }
    },
  );
};

func.tags = ['CurrencyController'];
func.dependencies = ['ProxyController', 'Tokens'];

export default func;
