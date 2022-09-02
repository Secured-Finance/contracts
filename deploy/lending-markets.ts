import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import moment from 'moment';
import { executeIfNewlyDeployment } from '../test-utils/deployment';
import { hexFILString, toBytes32 } from '../test-utils/strings';

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
  const lendingMarketController = await proxyController
    .getAddress(toBytes32('LendingMarketController'))
    .then((address) =>
      ethers.getContractAt('LendingMarketController', address),
    );

  await executeIfNewlyDeployment('LendingMarket', deployResult, async () => {
    await lendingMarketController
      .setLendingMarketImpl(deployResult.address)
      .then((tx) => tx.wait());
  });

  const isInitialized =
    await lendingMarketController.isInitializedLendingMarket(hexFILString);

  if (!isInitialized) {
    await lendingMarketController
      .initializeLendingMarket(
        hexFILString,
        process.env.MARKET_BASIS_DATE,
        process.env.INITIAL_COMPOUND_FACTOR,
      )
      .then((tx) => tx.wait());
  }

  const MARKET_COUNT = 4;
  const lendingMarkets = await lendingMarketController
    .getLendingMarkets(hexFILString)
    .then((addresses) =>
      Promise.all(
        addresses.map((address) =>
          ethers.getContractAt('LendingMarket', address),
        ),
      ),
    );

  const market: Record<string, string>[] = [];

  if (lendingMarkets.length >= MARKET_COUNT) {
    console.log('Skipped deploying FIL lending markets');
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
        .createLendingMarket(hexFILString)
        .then((tx) => tx.wait());

      const { marketAddr, maturity } = receipt.events.find(
        ({ event }) => event === 'LendingMarketCreated',
      ).args;
      market.push({
        Address: marketAddr,
        Maturity: moment.unix(maturity.toString()).format('LLL').toString(),
      });
    }
    console.log('Deployed FIL lending markets:');
  }

  console.table(market);
};

func.tags = ['LendingMarkets'];
func.dependencies = ['LendingMarketController', 'Migration'];

export default func;
