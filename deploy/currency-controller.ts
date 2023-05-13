import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies, mockPriceFeeds, priceOracles } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';
import { hexETH } from '../utils/strings';

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
        .setCurrencyControllerImpl(deployResult.address, hexETH)
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
        const priceFeedAddresses: string[] = [];

        if (priceOracles[currency.key]) {
          priceOracles[currency.key].forEach((priceOracle) => {
            if (priceOracle) {
              priceFeedAddresses.push(priceOracle);
            }
          });

          if (priceFeedAddresses.length === 0) {
            for (const priceFeed of mockPriceFeeds[currency.key]) {
              const priceFeedContract = await deploy('MockV3Aggregator', {
                from: deployer,
                args: [
                  priceFeed.decimals,
                  currency.key,
                  priceFeed.rate.toString(),
                ],
              });
              console.log(
                `Deployed MockV3Aggregator ${priceFeed.name} price feed at`,
                priceFeedContract.address,
              );
              priceFeedAddresses.push(priceFeedContract.address);
            }
          }
        }

        await currencyControllerContract
          .addCurrency(currency.key, currency.haircut, priceFeedAddresses)
          .then((tx) => tx.wait());
      }
    },
  );
};

func.tags = ['CurrencyController'];
func.dependencies = ['ProxyController'];

export default func;
