import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

import {
  MARKET_BASE_PERIOD,
  MINIMUM_RELIABLE_AMOUNT,
} from '../../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const TokenVault = artifacts.require('TokenVault');
const CurrencyController = artifacts.require('CurrencyController');
const FutureValueVault = artifacts.require('FutureValueVault');
const GenesisValueVault = artifacts.require('GenesisValueVault');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const ReserveFund = artifacts.require('ReserveFund');
const ZCToken = artifacts.require('ZCToken');

// external contracts
const LendingMarketReader = artifacts.require('LendingMarketReader');

// libraries
const MockERC20 = artifacts.require('MockERC20');
const OrderBookLogic = artifacts.require('OrderBookLogic');
const OrderReaderLogic = artifacts.require('OrderReaderLogic');
const LendingMarketOperationLogic = artifacts.require(
  'LendingMarketOperationLogic',
);
const QuickSort = artifacts.require('QuickSort');

const { deployContract, deployMockContract } = waffle;

const deployContracts = async (owner: SignerWithAddress) => {
  // Set up for the mocks
  const mockERC20 = await deployMockContract(owner, MockERC20.abi);
  const mockCurrencyController = await deployMockContract(
    owner,
    CurrencyController.abi,
  );
  const mockReserveFund = await deployMockContract(owner, ReserveFund.abi);
  const mockTokenVault = await deployMockContract(owner, TokenVault.abi);

  // Deploy libraries
  const quickSort = await deployContract(owner, QuickSort);
  const lendingMarketOperationLogic = await deployContract(
    owner,
    LendingMarketOperationLogic,
  );

  const fundManagementLogic = await ethers
    .getContractFactory('FundManagementLogic', {
      libraries: { QuickSort: quickSort.address },
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

  // Deploy contracts
  const addressResolver = await deployContract(owner, AddressResolver);
  const proxyController = await deployContract(owner, ProxyController, [
    ethers.constants.AddressZero,
  ]);
  const beaconProxyController = await deployContract(
    owner,
    BeaconProxyController,
  );
  const lendingMarketController = await ethers
    .getContractFactory('LendingMarketController', {
      libraries: {
        FundManagementLogic: fundManagementLogic.address,
        LendingMarketOperationLogic: lendingMarketOperationLogic.address,
        LendingMarketUserLogic: lendingMarketUserLogic.address,
        LiquidationLogic: liquidationLogic.address,
      },
    })
    .then((factory) => factory.deploy());
  const genesisValueVault = await deployContract(owner, GenesisValueVault);

  // Get the Proxy contract addresses
  await proxyController.setAddressResolverImpl(addressResolver.address);
  const addressResolverProxyAddress =
    await proxyController.getAddressResolverAddress();

  const lendingMarketControllerAddress = await proxyController
    .setLendingMarketControllerImpl(
      lendingMarketController.address,
      MARKET_BASE_PERIOD,
    )
    .then((tx) => tx.wait())
    .then(
      ({ events }) =>
        events.find(({ event }) => event === 'ProxyUpdated').args.proxyAddress,
    );

  const beaconProxyControllerAddress = await proxyController
    .setBeaconProxyControllerImpl(beaconProxyController.address)
    .then((tx) => tx.wait())
    .then(
      ({ events }) =>
        events.find(({ event }) => event === 'ProxyUpdated').args.proxyAddress,
    );

  const genesisValueVaultAddress = await proxyController
    .setGenesisValueVaultImpl(genesisValueVault.address)
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
  const lendingMarketControllerProxy = await ethers.getContractAt(
    'LendingMarketController',
    lendingMarketControllerAddress,
  );
  const genesisValueVaultProxy = await ethers.getContractAt(
    'GenesisValueVault',
    genesisValueVaultAddress,
  );
  // Deploy MigrationAddressResolver
  const migrationAddressResolver = await MigrationAddressResolver.new(
    addressResolverProxyAddress,
  );

  // Set up for AddressResolver and build caches using MigrationAddressResolver
  const migrationTargets: [string, Contract][] = [
    ['BeaconProxyController', beaconProxyControllerProxy],
    ['CurrencyController', mockCurrencyController],
    ['ReserveFund', mockReserveFund],
    ['TokenVault', mockTokenVault],
    ['GenesisValueVault', genesisValueVaultProxy],
    ['LendingMarketController', lendingMarketControllerProxy],
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
    genesisValueVaultProxy.address,
    lendingMarketControllerProxy.address,
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
  const futureValueVault = await deployContract(owner, FutureValueVault);
  const zcToken = await deployContract(owner, ZCToken);

  await beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address);
  await beaconProxyControllerProxy.setFutureValueVaultImpl(
    futureValueVault.address,
  );
  await beaconProxyControllerProxy.setZCTokenImpl(zcToken.address);

  // Deploy external contracts
  const lendingMarketReader = await deployContract(owner, LendingMarketReader, [
    addressResolverProxy.address,
  ]);

  return {
    // mocks
    mockERC20,
    mockCurrencyController,
    mockTokenVault,
    mockReserveFund,
    // proxies
    beaconProxyControllerProxy,
    lendingMarketControllerProxy,
    genesisValueVaultProxy,
    // external contracts
    lendingMarketReader,
    // logics
    fundManagementLogic,
    lendingMarketOperationLogic,
    liquidationLogic,
    orderActionLogic,
    orderBookLogic,
    orderReaderLogic,
  };
};

export { deployContracts };
