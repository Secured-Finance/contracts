import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';
import moment from 'moment';

import { btcToETHRate, ethToUSDRate, filToETHRate } from './numbers';
import { hexBTCString, hexETHString, hexFILString, toBytes32 } from './strings';

const marginCallThresholdRate = 15000;
const autoLiquidationThresholdRate = 12500;
const liquidationPriceRate = 12000;
const minCollateralRate = 2500;

const COMPOUND_FACTOR = '1010000000000000000';

const deployContracts = async () => {
  // Deploy contracts
  const contracts = [
    'AddressResolver',
    'BeaconProxyController',
    'TokenVault',
    'CurrencyController',
    'WETH9Mock',
    'LendingMarketController',
  ];

  const [
    addressResolver,
    beaconProxyController,
    tokenVault,
    currencyController,
    wETHToken,
    lendingMarketController,
  ] = await Promise.all(
    contracts.map((contract) =>
      ethers.getContractFactory(contract).then((factory) => factory.deploy()),
    ),
  );

  const wFILToken = await ethers
    .getContractFactory('ERC20Mock')
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
    tokenVaultAddress,
    currencyControllerAddress,
    lendingMarketControllerAddress,
  ] = await Promise.all([
    proxyController.setBeaconProxyControllerImpl(beaconProxyController.address),
    proxyController.setTokenVaultImpl(
      tokenVault.address,
      marginCallThresholdRate,
      autoLiquidationThresholdRate,
      liquidationPriceRate,
      minCollateralRate,
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
  const beaconProxyControllerProxy = await ethers.getContractAt(
    'BeaconProxyController',
    beaconProxyControllerAddress,
  );
  const tokenVaultProxy = await ethers.getContractAt(
    'TokenVault',
    tokenVaultAddress,
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
  );
  await currencyControllerProxy.supportCurrency(
    hexETHString,
    'Ethereum',
    ethToUSDPriceFeed.address,
    7500,
  );
  await currencyControllerProxy.supportCurrency(
    hexFILString,
    'Filecoin',
    filToETHPriceFeed.address,
    7500,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets: [string, Contract][] = [
    ['BeaconProxyController', beaconProxyControllerProxy],
    ['TokenVault', tokenVaultProxy],
    ['CurrencyController', currencyControllerProxy],
    ['LendingMarketController', lendingMarketControllerProxy],
  ];

  const importAddressesArgs = {
    names: migrationTargets.map(([name]) => toBytes32(name)),
    addresses: migrationTargets.map(([, contract]) => contract.address),
  };

  const buildCachesAddresses = [
    beaconProxyControllerProxy,
    tokenVaultProxy,
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

  await beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address);

  const { timestamp } = await ethers.provider.getBlock('latest');
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
    // contracts
    addressResolver: addressResolverProxy,
    beaconProxyController: beaconProxyControllerProxy,
    tokenVault: tokenVaultProxy,
    currencyController: currencyControllerProxy,
    lendingMarketController: lendingMarketControllerProxy,
    proxyController,
    wETHToken,
    wFILToken,
    // mocks
    btcToETHPriceFeed,
    ethToUSDPriceFeed,
    filToETHPriceFeed,
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
