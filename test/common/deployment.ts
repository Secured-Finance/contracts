import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { currencyIterator } from '../../utils/currencies';
import {
  hexETH,
  hexUSDC,
  hexWBTC,
  hexWFIL,
  toBytes32,
} from '../../utils/strings';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  HAIRCUT,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  MARKET_BASE_PERIOD,
  MINIMUM_RELIABLE_AMOUNT,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
} from './constants';
import {
  btcToUSDRate,
  ethToUSDRate,
  usdcToUSDRate,
  wBtcToBTCRate,
  wFilToETHRate,
} from './currencies';

const deployContracts = async () => {
  // Deploy libraries
  const [
    depositManagementLogic,
    lendingMarketOperationLogic,
    orderReaderLogic,
    orderBookLogic,
    quickSort,
  ] = await Promise.all(
    [
      'DepositManagementLogic',
      'LendingMarketOperationLogic',
      'OrderReaderLogic',
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

  const liquidationLogic = await ethers
    .getContractFactory('LiquidationLogic', {
      libraries: {
        FundManagementLogic: fundManagementLogic.address,
      },
    })
    .then((factory) => factory.deploy());

  const lendingMarketUserLogic = await ethers
    .getContractFactory('LendingMarketUserLogic', {
      libraries: {
        FundManagementLogic: fundManagementLogic.address,
        LendingMarketOperationLogic: lendingMarketOperationLogic.address,
      },
    })
    .then((factory) => factory.deploy());

  const orderActionLogic = await ethers
    .getContractFactory('OrderActionLogic', {
      libraries: {
        OrderReaderLogic: orderReaderLogic.address,
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
          LiquidationLogic: liquidationLogic.address,
        },
      })
      .then((factory) => factory.deploy()),
  ]);

  const tokens: Record<string, Contract> = {};
  for (const currency of currencyIterator()) {
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
  const wFILToken = tokens['wFIL'];
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
    proxyController.setCurrencyControllerImpl(currencyController.address),
    proxyController.setGenesisValueVaultImpl(genesisValueVault.address),
    proxyController.setLendingMarketControllerImpl(
      lendingMarketController.address,
      MARKET_BASE_PERIOD,
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
  const priceFeedContracts: Record<string, Contract> = {};
  const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator');

  const testRates = {
    ['WFIL/ETH']: wFilToETHRate,
    ['ETH/USD']: ethToUSDRate,
    ['WBTC/BTC']: wBtcToBTCRate,
    ['BTC/USD']: btcToUSDRate,
    ['USDC/USD']: usdcToUSDRate,
  };

  for (const currency of currencyIterator()) {
    const priceFeedAddresses: string[] = [];
    let heartbeat = 0;
    let decimals = 0;

    for (const priceFeed of currency.mockPriceFeed) {
      priceFeedContracts[priceFeed.name] = await MockV3Aggregator.deploy(
        priceFeed.decimals,
        currency.key,
        testRates[priceFeed.name],
      );

      decimals +=
        priceFeedAddresses.length === 0
          ? await tokens[currency.symbol].decimals()
          : currency.mockPriceFeed[priceFeedAddresses.length - 1].decimals;

      priceFeedAddresses.push(priceFeedContracts[priceFeed.name].address);

      if (heartbeat < priceFeed.heartbeat) {
        heartbeat = priceFeed.heartbeat;
      }
    }

    await currencyControllerProxy.addCurrency(
      currency.key,
      decimals,
      HAIRCUT,
      priceFeedAddresses,
      heartbeat,
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
        OrderActionLogic: orderActionLogic.address,
        OrderReaderLogic: orderReaderLogic.address,
        OrderBookLogic: orderBookLogic.address,
      },
    })
    .then((factory) => factory.deploy(MINIMUM_RELIABLE_AMOUNT));
  const futureValueVault = await ethers
    .getContractFactory('FutureValueVault')
    .then((factory) => factory.deploy());

  await beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address);
  await beaconProxyControllerProxy.setFutureValueVaultImpl(
    futureValueVault.address,
  );

  const { timestamp } = await ethers.provider.getBlock('latest');
  const genesisDate = moment(timestamp * 1000).unix();

  for (const currency of [hexWBTC, hexETH, hexWFIL, hexUSDC]) {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
      MIN_DEBT_UNIT_PRICE,
    );
  }

  // Deploy external contracts
  const lendingMarketReader = await ethers
    .getContractFactory('LendingMarketReader')
    .then((factory) => factory.deploy(addressResolverProxyAddress));

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
    wFILToken,
    wETHToken,
    wBTCToken,
    usdcToken,
    wFilToETHPriceFeed: priceFeedContracts['WFIL/ETH'],
    btcToUSDPriceFeed: priceFeedContracts['BTC/USD'],
    usdcToUSDPriceFeed: priceFeedContracts['USDC/USD'],
    // external contracts
    lendingMarketReader,
    // libraries
    fundManagementLogic: fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    ),
    lendingMarketOperationLogic: lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    ),
    liquidationLogic: liquidationLogic.attach(
      lendingMarketControllerProxy.address,
    ),
    orderActionLogic,
  };
};

export { deployContracts };
