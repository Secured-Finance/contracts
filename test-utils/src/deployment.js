const AddressResolver = artifacts.require('AddressResolver');
const CollateralAggregator = artifacts.require('CollateralAggregator');
const CollateralVault = artifacts.require('CollateralVault');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarket = artifacts.require('LendingMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const ProxyController = artifacts.require('ProxyController');
const WETH9Mock = artifacts.require('WETH9Mock');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
// const { deployContract } = waffle;

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

const deployContracts = async (mockCallbacks, mockContractNames) => {
  // Deploy libraries
  const QuickSort = await ethers.getContractFactory('QuickSort');
  const quickSortLibrary = await QuickSort.deploy();
  await quickSortLibrary.deployed();

  // Call callback functions for mocking
  const instances = {};
  for (const [name, callback] of Object.entries(mockCallbacks)) {
    instances[name] = await callback({ quickSortLibrary });
  }

  // Deploy contracts
  const addressResolver =
    instances['AddressResolver'] || (await AddressResolver.new());
  const collateralAggregator =
    instances['CollateralAggregator'] || (await CollateralAggregator.new());
  const collateralVault =
    instances['CollateralVault'] || (await CollateralVault.new());
  const currencyController =
    instances['CurrencyController'] || (await CurrencyController.new());

  const wETHToken = await WETH9Mock.new();

  const lendingMarketController =
    instances['LendingMarketController'] ||
    (await ethers
      .getContractFactory('LendingMarketController')
      .then((factory) => factory.deploy()));

  const proxyController =
    instances['ProxyController'] ||
    (await ProxyController.new(ethers.constants.AddressZero));

  // Get the Proxy contract address of AddressResolver
  await proxyController.setAddressResolverImpl(addressResolver.address);
  const addressResolverProxyAddress =
    await proxyController.getAddressResolverAddress();

  // Deploy MigrationAddressResolver
  const migrationAddressResolver = await MigrationAddressResolver.new(
    addressResolverProxyAddress,
  );

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
  ]).then((txs) =>
    txs.map(
      ({ logs }) =>
        logs.find(({ event }) => event === 'ProxyCreated').args.proxyAddress,
    ),
  );

  // Get the Proxy contract addresses
  const addressResolverProxy = await AddressResolver.at(
    addressResolverProxyAddress,
  );
  const collateralAggregatorProxy = await CollateralAggregator.at(
    collateralAggregatorAddress,
  );
  const collateralVaultProxy = await ethers.getContractAt(
    mockContractNames['CollateralVault'] || 'CollateralVault',
    collateralVaultAddress,
  );
  const currencyControllerProxy = await CurrencyController.at(
    currencyControllerAddress,
  );
  const lendingMarketControllerProxy = await ethers.getContractAt(
    mockContractNames['LendingMarketController'] || 'LendingMarketController',
    lendingMarketControllerAddress,
  );

  // Set up for CurrencyController
  const btcToETHPriceFeed = await MockV3Aggregator.new(
    18,
    hexBTCString,
    btcToETHRate,
  );
  const ethToUSDPriceFeed = await MockV3Aggregator.new(
    8,
    hexETHString,
    ethToUSDRate,
  );
  const filToETHPriceFeed = await MockV3Aggregator.new(
    18,
    hexFILString,
    filToETHRate,
  );

  await currencyControllerProxy.supportCurrency(
    hexBTCString,
    'Bitcoin',
    0,
    btcToETHPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyControllerProxy.supportCurrency(
    hexETHString,
    'Ethereum',
    60,
    ethToUSDPriceFeed.address,
    7500,
    zeroAddress,
  );
  await currencyControllerProxy.supportCurrency(
    hexFILString,
    'Filecoin',
    461,
    filToETHPriceFeed.address,
    7500,
    zeroAddress,
  );

  await currencyControllerProxy.updateCollateralSupport(hexETHString, true);
  await currencyControllerProxy.updateCollateralSupport(hexFILString, true);
  await currencyControllerProxy.updateMinMargin(hexETHString, 2500);

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
  const lendingMarket = await LendingMarket.new();

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

class Deployment {
  #mockCallbacks = {};
  #mockContractNames = {};

  mock(name) {
    return {
      useValue: this._useValue(name),
      useFactory: this._useFactory(name),
    };
  }

  _useValue(name) {
    return (value) => (this.#mockCallbacks[name] = () => value);
  }

  _useFactory(name) {
    return (key, callback) => {
      const deploy = (...args) => {
        const newCallback = async (libraries) => {
          const newLibraries = callback(libraries);
          return ethers
            .getContractFactory(key, { libraries: newLibraries })
            .then((factory) => factory.deploy(...args));
        };
        this.#mockCallbacks[name] = newCallback;
        this.#mockContractNames[name] = key;
      };
      return { deploy };
    };
  }

  execute() {
    return deployContracts(this.#mockCallbacks, this.#mockContractNames);
  }
}

const executeIfNewlyDeployment = async (name, deployResult, callback) => {
  if (deployResult.newlyDeployed) {
    console.log(`Deployed ${name} at ${deployResult.address}`);

    callback && (await callback());
  } else {
    console.warn(`Skipped deploying ${name}`);
  }
};

module.exports = { Deployment, executeIfNewlyDeployment };
