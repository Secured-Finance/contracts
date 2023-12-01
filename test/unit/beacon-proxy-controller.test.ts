import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract, deployMockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import { MINIMUM_RELIABLE_AMOUNT } from '../common/constants';

const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const CurrencyController = artifacts.require('CurrencyController');
const FutureValueVault = artifacts.require('FutureValueVault');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');
const BeaconProxyControllerCaller = artifacts.require(
  'BeaconProxyControllerCaller',
);
const UpgradeabilityBeaconProxy = artifacts.require(
  'UpgradeabilityBeaconProxy',
);

const { deployContract } = waffle;

describe('BeaconProxyController', () => {
  let mockCurrencyController: MockContract;

  let addressResolverProxy: Contract;
  let beaconProxyControllerProxy: Contract;
  let beaconProxyControllerCaller: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
  });

  beforeEach(async () => {
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
          events.find(({ event }) => event === 'ProxyUpdated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );

    beaconProxyControllerProxy = await ethers.getContractAt(
      'BeaconProxyController',
      beaconProxyControllerAddress,
    );

    // Deploy GenesisValueVaultCaller
    beaconProxyControllerCaller = await deployContract(
      owner,
      BeaconProxyControllerCaller,
      [beaconProxyControllerProxy.address],
    );

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['BeaconProxyController', beaconProxyControllerProxy],
      ['CurrencyController', mockCurrencyController],
      ['LendingMarketController', beaconProxyControllerCaller],
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
  });

  describe('Initialization', async () => {
    it('Check if the contract addresses are cached in the resolver', async () => {
      expect(await beaconProxyControllerProxy.isResolverCached()).to.true;
    });

    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(
        beaconProxyControllerProxy.initialize(
          owner.address,
          addressResolverProxy.address,
        ),
      ).revertedWith('Initializable: contract is already initialized');
    });

    it('Fail to call initialization due to execution by non-proxy contract', async () => {
      const beaconProxyController = await deployContract(
        owner,
        BeaconProxyController,
      );

      await expect(
        beaconProxyController.initialize(
          owner.address,
          addressResolverProxy.address,
        ),
      ).revertedWith('Must be called from proxy contract');
    });
  });

  describe('Get data', async () => {
    it('Get the required contracts', async () => {
      const requiredContracts =
        await beaconProxyControllerProxy.requiredContracts();

      expect(requiredContracts.length).to.equal(1);
      expect(requiredContracts[0]).to.equal(
        ethers.utils.formatBytes32String('LendingMarketController'),
      );
    });

    it('Fail to get the beacon proxy address due to empty address', async () => {
      const contractName = ethers.utils.formatBytes32String('Test');
      await expect(
        beaconProxyControllerProxy.getBeaconProxyAddress(contractName),
      ).revertedWith('NoBeaconProxyContract');
    });
  });

  describe('FutureValueVault implementation', async () => {
    it('Set an implementation contract and deploy the contract', async () => {
      const futureValueVault = await deployContract(owner, FutureValueVault);

      await expect(
        beaconProxyControllerProxy.setFutureValueVaultImpl(
          futureValueVault.address,
        ),
      )
        .emit(beaconProxyControllerProxy, 'BeaconProxyUpdated')
        .withArgs(
          ethers.utils.formatBytes32String('FutureValueVault'),
          () => true,
          () => true,
          ethers.constants.AddressZero,
        );

      await beaconProxyControllerCaller.deployFutureValueVault();
    });

    it('Set an implementation contract twice', async () => {
      const futureValueVault1 = await deployContract(owner, FutureValueVault);
      const futureValueVault2 = await deployContract(owner, FutureValueVault);
      const contractName = ethers.utils.formatBytes32String('FutureValueVault');

      await expect(
        beaconProxyControllerProxy.setFutureValueVaultImpl(
          futureValueVault1.address,
        ),
      )
        .emit(beaconProxyControllerProxy, 'BeaconProxyUpdated')
        .withArgs(
          contractName,
          () => true,
          futureValueVault1.address,
          ethers.constants.AddressZero,
        );

      const proxyAddress =
        await beaconProxyControllerProxy.getBeaconProxyAddress(contractName);

      await expect(
        beaconProxyControllerProxy.setFutureValueVaultImpl(
          futureValueVault2.address,
        ),
      )
        .emit(beaconProxyControllerProxy, 'BeaconProxyUpdated')
        .withArgs(
          contractName,
          proxyAddress,
          futureValueVault2.address,
          futureValueVault1.address,
        );
    });

    it('Fail to set an implementation contract due to execution by non-owner', async () => {
      const futureValueVault = await deployContract(owner, FutureValueVault);

      await expect(
        beaconProxyControllerProxy
          .connect(alice)
          .setFutureValueVaultImpl(futureValueVault.address),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to deploy the contract due to execution by non-accepted contract', async () => {
      await expect(
        beaconProxyControllerProxy.deployFutureValueVault(),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to deploy the contract due to non-existence of beacon proxy contract', async () => {
      await expect(
        beaconProxyControllerCaller.deployFutureValueVault(),
      ).revertedWith('NoBeaconProxyContract');
    });
  });

  describe('LendingMarket implementation', async () => {
    const deployLendingMarket = async () => {
      // Deploy libraries
      const [orderReaderLogic, orderBookLogic] = await Promise.all(
        ['OrderReaderLogic', 'OrderBookLogic'].map((library) =>
          ethers
            .getContractFactory(library)
            .then((factory) => factory.deploy()),
        ),
      );

      const orderActionLogic = await ethers
        .getContractFactory('OrderActionLogic', {
          libraries: {
            OrderReaderLogic: orderReaderLogic.address,
          },
        })
        .then((factory) => factory.deploy());

      return ethers
        .getContractFactory('LendingMarket', {
          libraries: {
            OrderActionLogic: orderActionLogic.address,
            OrderReaderLogic: orderReaderLogic.address,
            OrderBookLogic: orderBookLogic.address,
          },
        })
        .then((factory) => factory.deploy(MINIMUM_RELIABLE_AMOUNT));
    };

    it('Set an implementation contract and deploy the contract', async () => {
      const lendingMarket = await deployLendingMarket();

      await expect(
        beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket.address),
      )
        .emit(beaconProxyControllerProxy, 'BeaconProxyUpdated')
        .withArgs(
          ethers.utils.formatBytes32String('LendingMarket'),
          () => true,
          () => true,
          ethers.constants.AddressZero,
        );

      await beaconProxyControllerCaller.deployLendingMarket(
        ethers.utils.formatBytes32String('Test'),
        1,
        1,
      );
    });

    it('Set an implementation contract twice', async () => {
      const lendingMarket1 = await deployLendingMarket();
      const lendingMarket2 = await deployLendingMarket();
      const contractName = ethers.utils.formatBytes32String('LendingMarket');

      await expect(
        beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket1.address),
      )
        .emit(beaconProxyControllerProxy, 'BeaconProxyUpdated')
        .withArgs(
          contractName,
          () => true,
          lendingMarket1.address,
          ethers.constants.AddressZero,
        );

      const proxyAddress =
        await beaconProxyControllerProxy.getBeaconProxyAddress(contractName);

      await expect(
        beaconProxyControllerProxy.setLendingMarketImpl(lendingMarket2.address),
      )
        .emit(beaconProxyControllerProxy, 'BeaconProxyUpdated')
        .withArgs(
          contractName,
          proxyAddress,
          lendingMarket2.address,
          lendingMarket1.address,
        );
    });

    it('Fail to set an implementation contract due to execution by non-owner', async () => {
      const lendingMarket = await deployLendingMarket();

      await expect(
        beaconProxyControllerProxy
          .connect(alice)
          .setLendingMarketImpl(lendingMarket.address),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to deploy the contract due to execution by non-accepted contract', async () => {
      await expect(
        beaconProxyControllerProxy.deployLendingMarket(
          ethers.utils.formatBytes32String('Test'),
          1,
          1,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to deploy the contract due to non-existence of beacon proxy contract', async () => {
      await expect(
        beaconProxyControllerCaller.deployLendingMarket(
          ethers.utils.formatBytes32String('Test'),
          1,
          1,
        ),
      ).revertedWith('NoBeaconProxyContract');
    });
  });

  describe('Change Admin', async () => {
    it('Successfully change admins of a beacon proxy contract', async () => {
      const futureValueVault = await deployContract(owner, FutureValueVault);

      await beaconProxyControllerProxy.setFutureValueVaultImpl(
        futureValueVault.address,
      );
      await beaconProxyControllerCaller.deployFutureValueVault();
      const futureValueVaultProxyAddress =
        await beaconProxyControllerCaller.futureValueVault();
      await beaconProxyControllerProxy.changeBeaconProxyAdmins(alice.address, [
        futureValueVaultProxyAddress,
      ]);

      const futureValueVaultProxy = await UpgradeabilityBeaconProxy.at(
        futureValueVaultProxyAddress,
      );

      const futureValueVaultAdmin = await futureValueVaultProxy.admin();
      const implementation = await futureValueVaultProxy.implementation();

      expect(futureValueVaultAdmin).to.equal(alice.address);
      expect(implementation).to.equal(futureValueVault.address);
    });

    it('Fail to change admins of a beacon proxy contract due to execution by non-owner', async () => {
      await expect(
        beaconProxyControllerProxy
          .connect(alice)
          .changeBeaconProxyAdmins(alice.address, [
            ethers.constants.AddressZero,
          ]),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });
});
