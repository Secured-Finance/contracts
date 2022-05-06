const { zeroAddress } = require('../test-utils/src/strings');

const { filToETHRate, ethToUSDRate, btcToETHRate } =
  require('../test-utils').numbers;
const { hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const currencyController = await deploy('CurrencyController', {
    from: deployer,
  });
  const currencyControllerContract = await ethers.getContractAt(
    'CurrencyController',
    currencyController.address,
  );
  console.log('Deployed CurrencyController at ' + currencyController.address);

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

  await (
    await currencyControllerContract.supportCurrency(
      hexETHString,
      'Ethereum',
      60,
      ethToUSDPriceFeed.address,
      7500,
      zeroAddress,
    )
  ).wait();

  await (
    await currencyControllerContract.supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    )
  ).wait();

  await (
    await currencyControllerContract.supportCurrency(
      hexBTCString,
      'Bitcoin',
      0,
      btcToETHPriceFeed.address,
      7500,
      zeroAddress,
    )
  ).wait();

  await (
    await currencyControllerContract.updateCollateralSupport(hexETHString, true)
  ).wait();
  await (
    await currencyControllerContract.updateMinMargin(hexETHString, 2500)
  ).wait();
};

module.exports.tags = ['CurrencyController'];
module.exports.dependencies = ['CloseOutNetting'];
