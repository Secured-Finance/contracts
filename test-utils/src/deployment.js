const { ethers } = require('hardhat');
const moment = require('moment');

const {
  hexBTCString,
  hexETHString,
  hexFILString,
  zeroAddress,
  toBytes32,
} = require('./strings');
const { btcToETHRate, ethToUSDRate, filToETHRate } = require('./numbers');

const marginCallThresholdRate = 15000;
const autoLiquidationThresholdRate = 12500;
const liquidationPriceRate = 12000;
const minCollateralRate = 2500;

const COMPOUND_FACTOR = '1010000000000000000';

const deployContracts = async () => {
  // Deploy libraries
  const quickSortLibrary = await ethers
    .getContractFactory('QuickSort')
    .then((factory) => factory.deploy());
  await quickSortLibrary.deployed();

  // Deploy contracts
  const contracts = [
    'AddressResolver',
    'CollateralAggregator',
    'CollateralVault',
    'CurrencyController',
    'WETH9Mock',
    'LendingMarketController',
  ];

  const [
    addressResolver,
    collateralAggregator,
    collateralVault,
    currencyController,
    wETHToken,
    lendingMarketController,
  ] = await Promise.all(
    contracts.map((contract) =>
      ethers.getContractFactory(contract).then((factory) => factory.deploy()),
    ),
  );

  const proxyController = await ethers
    .getContractFactory('ProxyController')
    .then((factory) => factory.deploy(ethers.constants.AddressZero));

  // Get the Proxy contract address of AddressResolver
  await proxyController.setAddressResolverImpl(addressResolver.address);
  const addressResolverProxyAddress =
    await proxyController.getAddressResolverAddress();

  // Deploy MigrationAddressResolver
  const migrationAddressResolver = await ethers
    .getContractFactory('MigrationAddressResolver')
    .then((factory) => factory.deploy());

  // Set contract addresses to the Proxy contract
  const [
    collateralAggregatorAddress,
    collateralVaultAddress,
    currencyControllerAddress,
    lendingMarketControllerAddress,
  ] = await Promise.all([
    proxyController.setCollateralAggregatorImpl(
      collateralAggregator.address,
      marginCallThresholdRate,
      autoLiquidationThresholdRate,
      liquidationPriceRate,
      minCollateralRate,
    ),
    proxyController.setCollateralVaultImpl(
      collateralVault.address,
      wETHToken.address,
    ),
    proxyController.setCurrencyControllerImpl(currencyController.address),
    proxyController.setLendingMarketControllerImpl(
      lendingMarketController.address,
    ),
  ])
    .then((txs) => Promise.all(txs.map((tx) => tx.wait())))
    .then((txs) =>
      txs.map(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      ),
    );

  // Get the Proxy contract addresses
  const addressResolverProxy = await ethers.getContractAt(
    'AddressResolver',
    addressResolverProxyAddress,
  );
  const collateralAggregatorProxy = await ethers.getContractAt(
    'CollateralAggregator',
    collateralAggregatorAddress,
  );
  const collateralVaultProxy = await ethers.getContractAt(
    'CollateralVault',
    collateralVaultAddress,
  );
  const currencyControllerProxy = await ethers.getContractAt(
    'CurrencyController',
    currencyControllerAddress,
  );
  const lendingMarketControllerProxy = await ethers.getContractAt(
    'LendingMarketController',
    lendingMarketControllerAddress,
  );

  // Set up for CurrencyController
  const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');
  const btcToETHPriceFeed = await MockV3Aggregator.deploy(
    18,
    hexBTCString,
    btcToETHRate,
  );
  const ethToUSDPriceFeed = await MockV3Aggregator.deploy(
    8,
    hexETHString,
    ethToUSDRate,
  );
  const filToETHPriceFeed = await MockV3Aggregator.deploy(
    18,
    hexFILString,
    filToETHRate,
  );

  await currencyControllerProxy.supportCurrency(
    hexBTCString,
    'Bitcoin',
    btcToETHPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyControllerProxy.supportCurrency(
    hexETHString,
    'Ethereum',
    ethToUSDPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyControllerProxy.supportCurrency(
    hexFILString,
    'Filecoin',
    filToETHPriceFeed.address,
    7500,
    zeroAddress,
  );

  await currencyControllerProxy.updateCollateralSupport(hexETHString, true);
  await currencyControllerProxy.updateCollateralSupport(hexFILString, true);

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets = [
    ['CollateralAggregator', collateralAggregatorProxy],
    ['CollateralVault', collateralVaultProxy],
    ['CurrencyController', currencyControllerProxy],
    ['LendingMarketController', lendingMarketControllerProxy],
  ];

  const importAddressesArgs = {
    names: migrationTargets.map(([name]) => toBytes32(name)),
    addresses: migrationTargets.map(([, contract]) => contract.address),
  };

  const buildCachesAddresses = [
    collateralAggregatorProxy,
    collateralVaultProxy,
    lendingMarketControllerProxy,
  ]
    .filter((contract) => !!contract.buildCache) // exclude contracts that doesn't have buildCache method such as mock
    .map((contract) => contract.address);

  await addressResolverProxy.importAddresses(
    importAddressesArgs.names,
    importAddressesArgs.addresses,
  );
  await migrationAddressResolver.buildCaches(buildCachesAddresses);

  // Set up for LendingMarketController
  // const lendingMarket = await deployContract(owner, LendingMarket);
  const lendingMarket = await ethers
    .getContractFactory('LendingMarket')
    .then((factory) => factory.deploy());

  await lendingMarketControllerProxy.setLendingMarketImpl(
    lendingMarket.address,
  );

  const { timestamp } = await ethers.provider.getBlock();
  const basisDate = moment(timestamp * 1000).unix();
  await Promise.all([
    lendingMarketControllerProxy.initializeLendingMarket(
      hexBTCString,
      basisDate,
      COMPOUND_FACTOR,
    ),
    lendingMarketControllerProxy.initializeLendingMarket(
      hexETHString,
      basisDate,
      COMPOUND_FACTOR,
    ),
    lendingMarketControllerProxy.initializeLendingMarket(
      hexFILString,
      basisDate,
      COMPOUND_FACTOR,
    ),
  ]);

  return {
    // libraries
    quickSortLibrary,
    // contracts
    addressResolver: addressResolverProxy,
    collateralAggregator: collateralAggregatorProxy,
    collateralVault: collateralVaultProxy,
    currencyController: currencyControllerProxy,
    lendingMarketController: lendingMarketControllerProxy,
    proxyController,
    wETHToken,
    // mocks
    btcToETHPriceFeed,
    ethToUSDPriceFeed,
    filToETHPriceFeed,
  };
};

const executeIfNewlyDeployment = async (name, deployResult, callback) => {
  if (deployResult.newlyDeployed) {
    console.log(`Deployed ${name} at ${deployResult.address}`);

    callback && (await callback());
  } else {
    console.warn(`Skipped deploying ${name}`);
  }
};

module.exports = { deployContracts, executeIfNewlyDeployment };
