const { executeIfNewlyDeployment } = require('../test-utils').deployment;
const { hexFILString, toBytes32 } = require('../test-utils').strings;
const moment = require('moment');

module.exports = async function ({ deployments, getNamedAccounts }) {
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
    await lendingMarketController.initializeLendingMarket(
      hexFILString,
      process.env.MARKET_BASIS_DATE,
      process.env.INITIAL_COMPOUND_FACTOR,
    );
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

  const market = [];

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
    for (i = 0; i < count; i++) {
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

module.exports.tags = ['LendingMarkets'];
module.exports.dependencies = [
  'AddressResolver',
  'CollateralAggregator',
  'LendingMarketController',
  'Migration',
];
