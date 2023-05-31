import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { currencies, mockPriceFeeds } from '../../utils/currencies';
import {
  hexEFIL,
  hexETH,
  hexUSDC,
  hexWBTC,
  hexWFIL,
  toBytes32,
} from '../../utils/strings';
import {
  AUTO_ROLL_FEE_RATE,
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  MARKET_BASE_PERIOD,
  MARKET_OBSERVATION_PERIOD,
  ORDER_FEE_RATE,
} from './constants';

const deployContracts = async () => {
  // Deploy libraries
  const [
    depositManagementLogic,
    lendingMarketOperationLogic,
    lendingMarketConfigurationLogic,
    orderBookLogic,
    quickSort,
  ] = await Promise.all(
    [
      'DepositManagementLogic',
      'LendingMarketOperationLogic',
      'LendingMarketConfigurationLogic',
      'OrderBookLogic',
      'QuickSort',
    ].map((library) =>
      ethers.getContractFactory(library).then((factory) => factory.deploy()),
    ),
  );

  const fundManagementLogic = await ethers
    .getContractFactory('FundManagementLogic', {
      libraries: {
        QuickSort: quickSort.address,
      },
    })
    .then((factory) => factory.deploy());

  const lendingMarketUserLogic = await ethers
    .getContractFactory('LendingMarketUserLogic', {
      libraries: {
        FundManagementLogic: fundManagementLogic.address,
        LendingMarketConfigurationLogic:
          lendingMarketConfigurationLogic.address,
        LendingMarketOperationLogic: lendingMarketOperationLogic.address,
      },
    })
    .then((factory) => factory.deploy());

  // Deploy contracts
  const [
    addressResolver,
    beaconProxyController,
    currencyController,
    genesisValueVault,
    reserveFund,
    tokenVault,
    lendingMarketController,
  ] = await Promise.all([
    ...[
      'AddressResolver',
      'BeaconProxyController',
      'CurrencyController',
      'GenesisValueVault',
      'ReserveFund',
    ].map((contract) =>
      ethers.getContractFactory(contract).then((factory) => factory.deploy()),
    ),
    ethers
      .getContractFactory('TokenVault', {
        libraries: {
          DepositManagementLogic: depositManagementLogic.address,
        },
      })
      .then((factory) => factory.deploy()),
    ethers
      .getContractFactory('LendingMarketController', {
        libraries: {
          FundManagementLogic: fundManagementLogic.address,
          LendingMarketOperationLogic: lendingMarketOperationLogic.address,
          LendingMarketUserLogic: lendingMarketUserLogic.address,
          LendingMarketConfigurationLogic:
            lendingMarketConfigurationLogic.address,
        },
      })
      .then((factory) => factory.deploy()),
  ]);

  const tokens: Record<string, Contract> = {};
  for (const currency of currencies) {
    const args = currency.args;

    // Increase initial mint amount for testing
    if (args[0]) {
      args[0] = BigNumber.from(args[0]).mul(100).toString();
    }

    tokens[currency.symbol] = await ethers
      .getContractFactory(currency.mock)
      .then((factory) => factory.deploy(...args));
  }

  const eFILToken = tokens['eFIL'];
  const usdcToken = tokens['USDC'];
  const wBTCToken = tokens['WBTC'];
  const wETHToken = tokens['WETH'];

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
    reserveFundAddress,
    tokenVaultAddress,
  ] = await Promise.all([
    proxyController.setBeaconProxyControllerImpl(beaconProxyController.address),
    proxyController.setCurrencyControllerImpl(
      currencyController.address,
      hexETH,
    ),
    proxyController.setGenesisValueVaultImpl(genesisValueVault.address),
    proxyController.setLendingMarketControllerImpl(
      lendingMarketController.address,
      MARKET_BASE_PERIOD,
      MARKET_OBSERVATION_PERIOD,
    ),
    proxyController.setReserveFundImpl(reserveFund.address, wETHToken.address),
    proxyController.setTokenVaultImpl(
      tokenVault.address,
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
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
  const reserveFundProxy = await ethers.getContractAt(
    'ReserveFund',
    reserveFundAddress,
  );
  const tokenVaultProxy = await ethers.getContractAt(
    'TokenVault',
    tokenVaultAddress,
  );

  // Set up for CurrencyController
  const priceFeeds: Record<string, Contract> = {};
  const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');

  for (const currency of currencies) {
    const priceFeedAddresses: string[] = [];

    if (mockPriceFeeds[currency.key]) {
      for (const priceFeed of mockPriceFeeds[currency.key]) {
        priceFeeds[currency.key] = await MockV3Aggregator.deploy(
          priceFeed.decimals,
          currency.key,
          priceFeed.rate,
        );
        priceFeedAddresses.push(priceFeeds[currency.key].address);
      }
    }

    const decimals = await tokens[currency.symbol].decimals();
    await currencyControllerProxy.addCurrency(
      currency.key,
      decimals,
      currency.haircut,
      priceFeedAddresses,
    );
  }

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets: [string, Contract][] = [
    ['BeaconProxyController', beaconProxyControllerProxy],
    ['CurrencyController', currencyControllerProxy],
    ['GenesisValueVault', genesisValueVaultProxy],
    ['LendingMarketController', lendingMarketControllerProxy],
    ['ReserveFund', reserveFundProxy],
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
    reserveFundProxy,
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

  for (const currency of [hexWBTC, hexETH, hexWFIL, hexEFIL, hexUSDC]) {
    lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      AUTO_ROLL_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
    );
  }

  return {
    genesisDate,
    // contracts
    addressResolver: addressResolverProxy,
    beaconProxyController: beaconProxyControllerProxy,
    tokenVault: tokenVaultProxy,
    currencyController: currencyControllerProxy,
    genesisValueVault: genesisValueVaultProxy,
    lendingMarketController: lendingMarketControllerProxy,
    proxyController,
    reserveFund: reserveFundProxy,
    eFILToken,
    wETHToken,
    wBTCToken,
    usdcToken,
    wFilToETHPriceFeed: priceFeeds[hexWFIL],
    eFilToETHPriceFeed: priceFeeds[hexEFIL],
    wBtcToETHPriceFeed: priceFeeds[hexWBTC],
    usdcToUSDPriceFeed: priceFeeds[hexUSDC],
    // libraries
    fundManagementLogic: fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    ),
    lendingMarketOperationLogic: lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    ),
  };
};

export { deployContracts };
