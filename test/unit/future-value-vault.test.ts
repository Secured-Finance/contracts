import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

const AddressResolver = artifacts.require('AddressResolver');
const BeaconProxyController = artifacts.require('BeaconProxyController');
const CurrencyController = artifacts.require('CurrencyController');
const FutureValueVaultCaller = artifacts.require('FutureValueVaultCaller');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ProxyController = artifacts.require('ProxyController');

const { deployContract, deployMockContract } = waffle;

describe('FutureValueVault', () => {
  let futureValueVaultCaller: Contract;
  let futureValueVaultProxy: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  before(async () => {
    [owner, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async () => {
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
          events.find(({ event }) => event === 'ProxyUpdated').args
            .proxyAddress,
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
    futureValueVaultCaller = await deployContract(
      owner,
      FutureValueVaultCaller,
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
      ['LendingMarketController', futureValueVaultCaller],
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

    // Set up for FutureValueVault
    const futureValueVault = await ethers
      .getContractFactory('FutureValueVault')
      .then((factory) => factory.deploy());

    await beaconProxyControllerProxy.setFutureValueVaultImpl(
      futureValueVault.address,
    );

    await futureValueVaultCaller.deployFutureValueVault();

    futureValueVaultProxy = await futureValueVaultCaller
      .getFutureValueVault()
      .then((address) => ethers.getContractAt('FutureValueVault', address));
  });

  describe('Initialization', async () => {
    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(
        futureValueVaultProxy.initialize(ethers.constants.AddressZero),
      ).revertedWith('Initializable: contract is already initialized');
    });

    it('Fail to call initialization due to execution by non-beacon proxy contract', async () => {
      const futureValueVault = await ethers
        .getContractFactory('FutureValueVault')
        .then((factory) => factory.deploy());

      await expect(
        futureValueVault.initialize(ethers.constants.AddressZero),
      ).revertedWith('Must be called from beacon contract');
    });
  });

  describe('Update balance', async () => {
    const amount = 1000;
    const maturity = 20;

    it('Increase user balance', async () => {
      await expect(
        futureValueVaultCaller.increase(maturity, alice.address, amount),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          alice.address,
          maturity,
          amount,
        );
    });

    it('Decrease user balance', async () => {
      await expect(
        futureValueVaultCaller.decrease(maturity, alice.address, amount),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          alice.address,
          maturity,
          -amount,
        );
    });

    it('Fail to increase balance due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.increase(maturity, alice.address, amount),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to decrease balance due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.decrease(maturity, alice.address, amount),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to increase balance due to invalid user address', async () => {
      await expect(
        futureValueVaultCaller.increase(
          maturity,
          ethers.constants.AddressZero,
          amount,
        ),
      ).revertedWith('UserIsZero');
    });

    it('Fail to decrease balance due to invalid user address', async () => {
      await expect(
        futureValueVaultCaller.decrease(
          maturity,
          ethers.constants.AddressZero,
          amount,
        ),
      ).revertedWith('UserIsZero');
    });
  });

  describe('Transfer balance', async () => {
    const amount = 1000;
    const maturity = 20;

    it('Transfer balance to another user', async () => {
      await futureValueVaultCaller.increase(maturity, alice.address, amount);

      await expect(
        futureValueVaultCaller.transferFrom(
          maturity,
          alice.address,
          bob.address,
          amount,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(alice.address, bob.address, maturity, amount);
    });

    it('Fail to transfer balance due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.transferFrom(
          maturity,
          alice.address,
          bob.address,
          amount,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });

  describe('Reset balance', async () => {
    const amount = 1000;
    const maturity = 20;

    it("Force reset a user's empty balance with amount", async () => {
      await expect(
        futureValueVaultCaller['executeForcedReset(uint256,address,int256)'](
          maturity,
          alice.address,
          amount,
        ),
      ).not.emit(futureValueVaultProxy, 'Transfer');
    });

    it("Force reset a user's balance with amount", async () => {
      await futureValueVaultCaller.increase(maturity, alice.address, amount);

      await expect(
        futureValueVaultCaller['executeForcedReset(uint256,address,int256)'](
          maturity,
          alice.address,
          amount,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          alice.address,
          ethers.constants.AddressZero,
          maturity,
          amount,
        );
    });

    it("Force reset a user's empty balance without amount", async () => {
      await expect(
        futureValueVaultCaller['executeForcedReset(uint256,address)'](
          maturity,
          alice.address,
        ),
      ).not.emit(futureValueVaultProxy, 'Transfer');
    });

    it("Force reset a user's balance with amount", async () => {
      await futureValueVaultCaller.increase(maturity, alice.address, amount);

      await expect(
        futureValueVaultCaller['executeForcedReset(uint256,address)'](
          maturity,
          alice.address,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          alice.address,
          ethers.constants.AddressZero,
          maturity,
          amount,
        );
    });

    it("Fail to force reset a user's balance due to lending amount mismatch", async () => {
      await futureValueVaultCaller.increase(maturity, alice.address, amount);

      await expect(
        futureValueVaultCaller['executeForcedReset(uint256,address,int256)'](
          maturity,
          alice.address,
          -amount,
        ),
      ).revertedWith('InvalidResetAmount');
    });

    it("Fail to force reset a user's balance due to borrowing amount mismatch", async () => {
      await futureValueVaultCaller.decrease(maturity, alice.address, amount);

      await expect(
        futureValueVaultCaller['executeForcedReset(uint256,address,int256)'](
          maturity,
          alice.address,
          amount,
        ),
      ).revertedWith('InvalidResetAmount');
    });

    it("Fail to force reset a user's balance with amount due to execution by non-accepted contract", async () => {
      await expect(
        futureValueVaultProxy['executeForcedReset(uint256,address,int256)'](
          maturity,
          alice.address,
          amount,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it("Fail to force reset a user's balance without amount due to execution by non-accepted contract", async () => {
      await expect(
        futureValueVaultProxy['executeForcedReset(uint256,address)'](
          maturity,
          alice.address,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });
});
