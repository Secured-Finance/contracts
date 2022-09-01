const { filToETHRate, ethToUSDRate, btcToETHRate } =
  require('../test-utils').numbers;
const { hexFILString, hexBTCString, hexETHString, zeroAddress } =
  require('../test-utils').strings;
const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
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
      const filToETHPriceFeed = await deploy('MockV3Aggregator', {
        from: deployer,
        args: [18, hexFILString, filToETHRate.toString()],
      });
      console.log(
        'Deployed MockV3Aggregator FIL/ETH price feed at ' +
          filToETHPriceFeed.address,
      );

      const ethToUSDPriceFeed = await deploy('MockV3Aggregator', {
        from: deployer,
        args: [18, hexETHString, ethToUSDRate.toString()],
      });
      console.log(
        'Deployed MockV3Aggregator ETH/USD price feed at ' +
          ethToUSDPriceFeed.address,
      );

      const btcToETHPriceFeed = await deploy('MockV3Aggregator', {
        from: deployer,
        args: [18, hexBTCString, btcToETHRate.toString()],
      });
      console.log(
        'Deployed MockV3Aggregator BTC/ETH price feed at ' +
          btcToETHPriceFeed.address,
      );

      await currencyControllerContract
        .supportCurrency(
          hexETHString,
          'Ethereum',
          ethToUSDPriceFeed.address,
          7500,
          zeroAddress,
        )
        .then((tx) => tx.wait());

      await currencyControllerContract
        .supportCurrency(
          hexFILString,
          'Filecoin',
          filToETHPriceFeed.address,
          7500,
          zeroAddress,
        )
        .then((tx) => tx.wait());

      await currencyControllerContract
        .supportCurrency(
          hexBTCString,
          'Bitcoin',
          btcToETHPriceFeed.address,
          7500,
          zeroAddress,
        )
        .then((tx) => tx.wait());

      await currencyControllerContract
        .updateCollateralSupport(hexETHString, true)
        .then((tx) => tx.wait());
    },
  );
};

module.exports.tags = ['CurrencyController'];
module.exports.dependencies = ['ProxyController'];
