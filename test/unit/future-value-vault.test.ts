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

  let currentOrderBookId = 0;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  before(async () => {
    [owner, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async () => {
    currentOrderBookId++;

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

    await futureValueVaultCaller.deployFutureValueVault(currentOrderBookId);

    futureValueVaultProxy = await futureValueVaultCaller
      .getFutureValueVault(currentOrderBookId)
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

    it('Fail to set the initial total supply due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.setInitialTotalSupply(1, 2),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });

  describe('Update balance', async () => {
    const amount = 1000;
    const maturity = 20;
    const oldMaturity = 10;

    it('Increase user balance', async () => {
      await expect(
        futureValueVaultCaller.increase(
          currentOrderBookId,
          alice.address,
          amount,
          maturity,
          true,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          alice.address,
          currentOrderBookId,
          maturity,
          amount,
        );

      await expect(
        futureValueVaultCaller.increase(
          currentOrderBookId,
          alice.address,
          amount,
          oldMaturity,
          true,
        ),
      ).revertedWith(`PastMaturityBalanceExists("${alice.address}")`);
    });

    it('Decrease user balance', async () => {
      await expect(
        futureValueVaultCaller.decrease(
          currentOrderBookId,
          alice.address,
          amount,
          maturity,
          true,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          alice.address,
          currentOrderBookId,
          maturity,
          -amount,
        );

      await expect(
        futureValueVaultCaller.decrease(
          currentOrderBookId,
          alice.address,
          amount,
          oldMaturity,
          true,
        ),
      ).revertedWith(`PastMaturityBalanceExists("${alice.address}")`);
    });

    it('Fail to increase balance due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.increase(
          currentOrderBookId,
          alice.address,
          amount,
          maturity,
          true,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to decrease balance due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.decrease(
          currentOrderBookId,
          alice.address,
          amount,
          maturity,
          true,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it('Fail to increase balance due to invalid user address', async () => {
      await expect(
        futureValueVaultCaller.increase(
          currentOrderBookId,
          ethers.constants.AddressZero,
          amount,
          maturity,
          true,
        ),
      ).revertedWith('UserIsZero');
    });

    it('Fail to decrease balance due to invalid user address', async () => {
      await expect(
        futureValueVaultCaller.decrease(
          currentOrderBookId,
          ethers.constants.AddressZero,
          amount,
          maturity,
          true,
        ),
      ).revertedWith('UserIsZero');
    });
  });

  describe('Transfer balance', async () => {
    const amount = 1000;
    const maturity = 20;
    const oldMaturity = 10;

    it('Transfer balance to another user', async () => {
      await futureValueVaultCaller.increase(
        currentOrderBookId,
        alice.address,
        amount,
        maturity,
        true,
      );

      await expect(
        futureValueVaultCaller.transferFrom(
          currentOrderBookId,
          alice.address,
          bob.address,
          amount,
          maturity,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          alice.address,
          bob.address,
          currentOrderBookId,
          maturity,
          amount,
        );
    });

    it('Fail to transfer balance because sender has balance in the past maturity', async () => {
      await futureValueVaultCaller.increase(
        currentOrderBookId,
        alice.address,
        amount,
        oldMaturity,
        true,
      );

      await expect(
        futureValueVaultCaller.transferFrom(
          currentOrderBookId,
          alice.address,
          bob.address,
          amount,
          maturity,
        ),
      ).revertedWith(`PastMaturityBalanceExists("${alice.address}")`);
    });

    it('Fail to transfer balance because receiver has balance in the past maturity', async () => {
      await futureValueVaultCaller.increase(
        currentOrderBookId,
        bob.address,
        amount,
        oldMaturity,
        true,
      );

      await expect(
        futureValueVaultCaller.transferFrom(
          currentOrderBookId,
          alice.address,
          bob.address,
          amount,
          maturity,
        ),
      ).revertedWith(`PastMaturityBalanceExists("${bob.address}")`);
    });

    it('Fail to transfer balance due to execution by non-accepted contract', async () => {
      await expect(
        futureValueVaultProxy.transferFrom(
          currentOrderBookId,
          alice.address,
          bob.address,
          amount,
          maturity,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });

  describe('Reset balance', async () => {
    const amount = 1000;
    const maturity = 20;

    it("Force reset a user's empty balance with amount", async () => {
      await expect(
        futureValueVaultCaller['executeForcedReset(uint8,address,int256)'](
          currentOrderBookId,
          alice.address,
          amount,
        ),
      ).not.emit(futureValueVaultProxy, 'Transfer');
    });

    it("Force reset a user's balance with amount", async () => {
      await futureValueVaultCaller.increase(
        currentOrderBookId,
        alice.address,
        amount,
        maturity,
        true,
      );

      await expect(
        futureValueVaultCaller['executeForcedReset(uint8,address,int256)'](
          currentOrderBookId,
          alice.address,
          amount,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          alice.address,
          ethers.constants.AddressZero,
          currentOrderBookId,
          maturity,
          amount,
        );
    });

    it("Force reset a user's empty balance without amount", async () => {
      await expect(
        futureValueVaultCaller['executeForcedReset(uint8,address)'](
          currentOrderBookId,
          alice.address,
        ),
      ).not.emit(futureValueVaultProxy, 'Transfer');
    });

    it("Force reset a user's balance with amount", async () => {
      await futureValueVaultCaller.increase(
        currentOrderBookId,
        alice.address,
        amount,
        maturity,
        true,
      );

      await expect(
        futureValueVaultCaller['executeForcedReset(uint8,address)'](
          currentOrderBookId,
          alice.address,
        ),
      )
        .emit(futureValueVaultProxy, 'Transfer')
        .withArgs(
          alice.address,
          ethers.constants.AddressZero,
          currentOrderBookId,
          maturity,
          amount,
        );
    });

    it("Fail to force reset a user's balance due to lending amount mismatch", async () => {
      await futureValueVaultCaller.increase(
        currentOrderBookId,
        alice.address,
        amount,
        maturity,
        true,
      );

      await expect(
        futureValueVaultCaller['executeForcedReset(uint8,address,int256)'](
          currentOrderBookId,
          alice.address,
          -amount,
        ),
      ).revertedWith('InvalidResetAmount');
    });

    it("Fail to force reset a user's balance due to borrowing amount mismatch", async () => {
      await futureValueVaultCaller.decrease(
        currentOrderBookId,
        alice.address,
        amount,
        maturity,
        true,
      );

      await expect(
        futureValueVaultCaller['executeForcedReset(uint8,address,int256)'](
          currentOrderBookId,
          alice.address,
          amount,
        ),
      ).revertedWith('InvalidResetAmount');
    });

    it("Fail to force reset a user's balance with amount due to execution by non-accepted contract", async () => {
      await expect(
        futureValueVaultProxy['executeForcedReset(uint8,address,int256)'](
          currentOrderBookId,
          alice.address,
          amount,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });

    it("Fail to force reset a user's balance without amount due to execution by non-accepted contract", async () => {
      await expect(
        futureValueVaultProxy['executeForcedReset(uint8,address)'](
          currentOrderBookId,
          alice.address,
        ),
      ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
    });
  });
});
