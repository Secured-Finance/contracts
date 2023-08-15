import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  ORDER_FEE_RATE,
} from '../../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const LendingMarketCaller = artifacts.require('LendingMarketCaller');

// libraries
const OrderBookLogic = artifacts.require('OrderBookLogic');
const OrderReaderLogic = artifacts.require('OrderReaderLogic');

const { deployContract } = waffle;

const deployContracts = async (owner: SignerWithAddress) => {
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
        events.find(({ event }) => event === 'ProxyCreated').args.proxyAddress,
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
    .then((factory) => factory.deploy());

  await beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address);

  return {
    // mocks
    lendingMarketCaller,
    // logics
    orderBookLogic,
    orderActionLogic,
  };
};

const deployLendingMarket = async (
  targetCurrency: string,
  lendingMarketCaller: Contract,
) => {
  await lendingMarketCaller.deployLendingMarket(
    targetCurrency,
    ORDER_FEE_RATE,
    CIRCUIT_BREAKER_LIMIT_RANGE,
  );

  const lendingMarket = await lendingMarketCaller
    .getLendingMarket(targetCurrency)
    .then((address) => ethers.getContractAt('LendingMarket', address));

  return {
    lendingMarket,
  };
};

export { deployContracts, deployLendingMarket };
