import PythAbi from '@pythnetwork/pyth-sdk-solidity/abis/IPyth.json';
import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencyIterator } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

const HERMES_API_URL = 'https://hermes.pyth.network/v2/updates/price/latest';

const updatePythPriceFeed = async (
  description: string,
  priceId: string,
  pyth: Contract,
) => {
  const response = await fetch(`${HERMES_API_URL}?ids%5B%5D=${priceId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Pyth price feed for ${description}.  Error: ${response.statusText}`,
    );
  }

  const {
    binary: { data },
  } = await response.json();

  const updateData = [`0x${data[0]}`];
  const feeAmount = await pyth.getUpdateFee(updateData);

  await pyth
    .updatePriceFeeds(updateData, { value: feeAmount })
    .then((tx) => tx.wait());

  console.log(
    `Updated Pyth price feed for ${description} with fee, ${feeAmount.toString()}.`,
  );
};

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (process.env.PYTH_PRICE_FEED_ADDRESS) {
    const pyth = await ethers.getContractAt(
      PythAbi,
      process.env.PYTH_PRICE_FEED_ADDRESS,
    );

    for (const currency of currencyIterator()) {
      const description = `${currency.symbol} / USD`;

      await updatePythPriceFeed(
        description,
        currency.pythPriceFeed.priceId,
        pyth,
      );

      const deployResult = await deploy('PythAggregator', {
        from: deployer,
        args: [
          process.env.PYTH_PRICE_FEED_ADDRESS,
          currency.pythPriceFeed.priceId,
          description,
        ],
        skipIfAlreadyDeployed: false,
      });

      await executeIfNewlyDeployment(
        `${description} PythAggregator`,
        deployResult,
        async () => {
          const proxyController: Contract = await deployments
            .get('ProxyController')
            .then(({ address }) =>
              ethers.getContractAt('ProxyController', address),
            );

          const currencyController: Contract = await proxyController
            .getAddress(toBytes32('CurrencyController'))
            .then((address) =>
              ethers.getContractAt('CurrencyController', address),
            );

          await currencyController
            .updatePriceFeed(
              currency.key,
              await currencyController.getDecimals(currency.key),
              [deployResult.address],
              [currency.pythPriceFeed.heartbeat || '86400'],
            )
            .then((tx) => tx.wait());

          console.log(
            `Registered PythAggregator as a ${description} price feed.`,
          );
        },
      );
    }
  }

  if (process.env.GLIF_POOL_ADDRESS) {
    const deployResult = await deploy('GlifIFilAggregator', {
      from: deployer,
      args: [process.env.GLIF_POOL_ADDRESS],
    });

    await executeIfNewlyDeployment('GlifIFilAggregator', deployResult);
  }
};

func.tags = ['ExternalContractsFVM'];
func.skip = async () => !process.env.PYTH_PRICE_FEED_ADDRESS;
func.runAtTheEnd = true;
export default func;
