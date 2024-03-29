import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  MINIMUM_RELIABLE_AMOUNT,
  ORDER_FEE_RATE,
} from '../../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const LendingMarketCaller = artifacts.require('LendingMarketCaller');
const CurrencyController = artifacts.require('CurrencyController');

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');
const OrderReaderLogic = artifacts.require('OrderReaderLogic');

const { deployContract, deployMockContract } = waffle;

const deployOrderBook = async (
  currency: string,
  maturity: number,
  openingDate: number,
  lendingMarketCaller: Contract,
): Promise<BigNumber> => {
  await lendingMarketCaller.createOrderBook(
    currency,
    maturity,
    openingDate,
    openingDate - 604800,
  );

  return lendingMarketCaller.getOrderBookId(currency);
};

const deployContracts = async (owner: SignerWithAddress, currency: string) => {
  // Set up for the mocks
  const mockCurrencyController = await deployMockContract(
    owner,
    CurrencyController.abi,
  );
  // Deploy contracts
  const addressResolver = await deployContract(owner, AddressResolver);
  const proxyController = await deployContract(owner, ProxyController, [
    ethers.constants.AddressZero,
  ]);
  const beaconProxyController = await deployContract(
    owner,
    BeaconProxyController,
  );

  // Get the Proxy contract addresses
  await proxyController.setAddressResolverImpl(addressResolver.address);
  const addressResolverProxyAddress =
    await proxyController.getAddressResolverAddress();

  const beaconProxyControllerAddress = await proxyController
    .setBeaconProxyControllerImpl(beaconProxyController.address)
    .then((tx) => tx.wait())
    .then(
      ({ events }) =>
        events.find(({ event }) => event === 'ProxyUpdated').args.proxyAddress,
    );

  // Get the Proxy contracts
  const addressResolverProxy = await ethers.getContractAt(
    'AddressResolver',
    addressResolverProxyAddress,
  );
  const beaconProxyControllerProxy = await ethers.getContractAt(
    'BeaconProxyController',
    beaconProxyControllerAddress,
  );

  // Deploy LendingMarketCaller
  const lendingMarketCaller = await deployContract(owner, LendingMarketCaller, [
    beaconProxyControllerProxy.address,
  ]);

  // Deploy MigrationAddressResolver
  const migrationAddressResolver = await MigrationAddressResolver.new(
    addressResolverProxyAddress,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets: [string, Contract][] = [
    ['BeaconProxyController', beaconProxyControllerProxy],
    ['CurrencyController', mockCurrencyController],
    ['LendingMarketController', lendingMarketCaller],
  ];

  const importAddressesArgs = {
    names: migrationTargets.map(([name]) =>
      ethers.utils.formatBytes32String(name),
    ),
    addresses: migrationTargets.map(([, contract]) => contract.address),
  };

  await addressResolverProxy.importAddresses(
    importAddressesArgs.names,
    importAddressesArgs.addresses,
  );
  await migrationAddressResolver.buildCaches([
    beaconProxyControllerProxy.address,
  ]);

  // Set up for LendingMarketController
  const orderReaderLogic = await deployContract(owner, OrderReaderLogic);

  const orderBookLogic = await deployContract(owner, OrderBookLogic);

  const orderActionLogic = await ethers
    .getContractFactory('OrderActionLogic', {
      libraries: {
        OrderReaderLogic: orderReaderLogic.address,
      },
    })
    .then((factory) => factory.deploy());

  const lendingMarket = await ethers
    .getContractFactory('LendingMarket', {
      libraries: {
        OrderActionLogic: orderActionLogic.address,
        OrderReaderLogic: orderReaderLogic.address,
        OrderBookLogic: orderBookLogic.address,
      },
    })
    .then((factory) => factory.deploy(MINIMUM_RELIABLE_AMOUNT));

  await beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address);

  await lendingMarketCaller.deployLendingMarket(
    currency,
    ORDER_FEE_RATE,
    CIRCUIT_BREAKER_LIMIT_RANGE,
  );

  const lendingMarketProxy: Contract = await lendingMarketCaller
    .getLendingMarket(currency)
    .then((address) => ethers.getContractAt('LendingMarket', address));

  return {
    mockCurrencyController,
    lendingMarketCaller,
    lendingMarket: lendingMarketProxy,
    orderActionLogic: orderActionLogic.attach(lendingMarketProxy.address),
    orderBookLogic: orderBookLogic.attach(lendingMarketProxy.address),
  };
};

export { deployContracts, deployOrderBook };
