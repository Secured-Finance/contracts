import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';
import moment from 'moment';

import { currencies, mockRates } from '../utils/currencies';
import {
  hexBTCString,
  hexETHString,
  hexFILString,
  hexUSDCString,
  toBytes32,
} from './strings';

const LIQUIDATION_THRESHOLD_RATE = 12500;

const COMPOUND_FACTOR = '1010000000000000000';

const deployContracts = async () => {
  // Deploy libraries
  const [fundCalculationLogic, orderBookLogic] = await Promise.all(
    ['FundCalculationLogic', 'OrderBookLogic'].map((library) =>
      ethers.getContractFactory(library).then((factory) => factory.deploy()),
    ),
  );

  // Deploy contracts
  const [
    addressResolver,
    beaconProxyController,
    currencyController,
    genesisValueVault,
    wETHToken,
    tokenVault,
    lendingMarketController,
  ] = await Promise.all([
    ...[
      'AddressResolver',
      'BeaconProxyController',
      'CurrencyController',
      'GenesisValueVault',
      'MockWETH9',
      'TokenVault',
    ].map((contract) =>
      ethers.getContractFactory(contract).then((factory) => factory.deploy()),
    ),
    ethers
      .getContractFactory('LendingMarketController', {
        libraries: {
          FundCalculationLogic: fundCalculationLogic.address,
        },
      })
      .then((factory) => factory.deploy()),
  ]);

  const wFILToken = await ethers
    .getContractFactory('MockERC20')
    .then((factory) =>
      factory.deploy('Wrapped Filecoin', 'WFIL', '100000000000000000000000'),
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
    beaconProxyControllerAddress,
    currencyControllerAddress,
    genesisValueVaultAddress,
    lendingMarketControllerAddress,
    tokenVaultAddress,
  ] = await Promise.all([
    proxyController.setBeaconProxyControllerImpl(beaconProxyController.address),
    proxyController.setCurrencyControllerImpl(currencyController.address),
    proxyController.setGenesisValueVaultImpl(genesisValueVault.address),
    proxyController.setLendingMarketControllerImpl(
      lendingMarketController.address,
    ),
    proxyController.setTokenVaultImpl(
      tokenVault.address,
      LIQUIDATION_THRESHOLD_RATE,
      // TODO: Need to set a mock uniswap contract here
      ethers.constants.AddressZero,
      wETHToken.address,
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
  const beaconProxyControllerProxy = await ethers.getContractAt(
    'BeaconProxyController',
    beaconProxyControllerAddress,
  );
  const currencyControllerProxy = await ethers.getContractAt(
    'CurrencyController',
    currencyControllerAddress,
  );
  const genesisValueVaultProxy = await ethers.getContractAt(
    'GenesisValueVault',
    genesisValueVaultAddress,
  );
  const lendingMarketControllerProxy = await ethers.getContractAt(
    'LendingMarketController',
    lendingMarketControllerAddress,
  );
  const tokenVaultProxy = await ethers.getContractAt(
    'TokenVault',
    tokenVaultAddress,
  );

  // Set up for CurrencyController
  const priceFeeds: Record<string, Contract> = {};
  const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');

  for (const rate of mockRates) {
    priceFeeds[rate.key] = await MockV3Aggregator.deploy(
      rate.decimals,
      rate.key,
      rate.rate,
    );
  }

  for (const currency of currencies) {
    await currencyControllerProxy.addCurrency(
      currency.key,
      priceFeeds[currency.key].address,
      currency.haircut,
    );
  }

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets: [string, Contract][] = [
    ['BeaconProxyController', beaconProxyControllerProxy],
    ['CurrencyController', currencyControllerProxy],
    ['GenesisValueVault', genesisValueVaultProxy],
    ['LendingMarketController', lendingMarketControllerProxy],
    ['TokenVault', tokenVaultProxy],
  ];

  const importAddressesArgs = {
    names: migrationTargets.map(([name]) => toBytes32(name)),
    addresses: migrationTargets.map(([, contract]) => contract.address),
  };

  const buildCachesAddresses = [
    beaconProxyControllerProxy,
    lendingMarketControllerProxy,
    genesisValueVaultProxy,
    tokenVaultProxy,
  ]
    .filter((contract) => !!contract.buildCache) // exclude contracts that doesn't have buildCache method such as mock
    .map((contract) => contract.address);

  await addressResolverProxy.importAddresses(
    importAddressesArgs.names,
    importAddressesArgs.addresses,
  );
  await migrationAddressResolver.buildCaches(buildCachesAddresses);

  // Set up for LendingMarketController
  const lendingMarket = await ethers
    .getContractFactory('LendingMarket', {
      libraries: {
        OrderBookLogic: orderBookLogic.address,
      },
    })
    .then((factory) => factory.deploy());
  const futureValueVault = await ethers
    .getContractFactory('FutureValueVault')
    .then((factory) => factory.deploy());

  await beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address);
  await beaconProxyControllerProxy.setFutureValueVaultImpl(
    futureValueVault.address,
  );

  const { timestamp } = await ethers.provider.getBlock('latest');
  const genesisDate = moment(timestamp * 1000).unix();
  await Promise.all([
    lendingMarketControllerProxy.initializeLendingMarket(
      hexBTCString,
      genesisDate,
      COMPOUND_FACTOR,
    ),
    lendingMarketControllerProxy.initializeLendingMarket(
      hexETHString,
      genesisDate,
      COMPOUND_FACTOR,
    ),
    lendingMarketControllerProxy.initializeLendingMarket(
      hexFILString,
      genesisDate,
      COMPOUND_FACTOR,
    ),
  ]);

  return {
    // contracts
    addressResolver: addressResolverProxy,
    beaconProxyController: beaconProxyControllerProxy,
    tokenVault: tokenVaultProxy,
    currencyController: currencyControllerProxy,
    genesisValueVault: genesisValueVaultProxy,
    lendingMarketController: lendingMarketControllerProxy,
    proxyController,
    wETHToken,
    wFILToken,
    btcToETHPriceFeed: priceFeeds[hexBTCString],
    ethToUSDPriceFeed: priceFeeds[hexETHString],
    filToETHPriceFeed: priceFeeds[hexFILString],
    usdcToUSDriceFeed: priceFeeds[hexUSDCString],
  };
};

const executeIfNewlyDeployment = async (
  name: string,
  deployResult: DeployResult,
  callback?: Function,
) => {
  if (deployResult.newlyDeployed) {
    console.log(`Deployed ${name} at ${deployResult.address}`);

    callback && (await callback());
  } else {
    console.warn(`Skipped deploying ${name}`);
  }
};

export { deployContracts, executeIfNewlyDeployment };
