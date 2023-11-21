import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ReserveFund = artifacts.require('ReserveFund');
const ProxyController = artifacts.require('ProxyController');
const GenesisValueVaultCaller = artifacts.require('GenesisValueVaultCaller');

const { deployContract, deployMockContract } = waffle;

describe('GenesisValueVault', () => {
  let mockLendingMarketController: MockContract;
  let mockReserveFund: MockContract;

  let genesisValueVaultProxy: Contract;
  let genesisValueVaultCaller: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let signers: SignerWithAddress[];

  let targetCurrency: string;
  let currencyIdx = 0;

  before(async () => {
    [owner, alice, ...signers] = await ethers.getSigners();

    // Set up for the mocks
    mockReserveFund = await deployMockContract(owner, ReserveFund.abi);
    mockLendingMarketController = await deployMockContract(
      owner,
      LendingMarketController.abi,
    );

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const genesisValueVault = await ethers
      .getContractFactory('GenesisValueVault')
      .then((factory) => factory.deploy());

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const genesisValueAddress = await proxyController
      .setGenesisValueVaultImpl(genesisValueVault.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyCreated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    genesisValueVaultProxy = await ethers.getContractAt(
      'GenesisValueVault',
      genesisValueAddress,
    );

    // Deploy GenesisValueVaultCaller
    genesisValueVaultCaller = await deployContract(
      owner,
      GenesisValueVaultCaller,
      [genesisValueVaultProxy.address],
    );

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['GenesisValueVault', genesisValueVaultProxy],
      ['ReserveFund', mockReserveFund],
      ['LendingMarketController', genesisValueVaultCaller],
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
      genesisValueVaultProxy.address,
    ]);
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;
  });

  describe('Initialize', async () => {
    it('Initialize the currency setting', async () => {
      const initialCompoundFactor = BigNumber.from(1000);
      const maturity = 1;
      const decimals = 4;

      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );

      expect(await genesisValueVaultProxy.isInitialized(targetCurrency)).to
        .true;
      expect(
        await genesisValueVaultProxy.getCurrentMaturity(targetCurrency),
      ).to.equals(maturity);
      expect(await genesisValueVaultProxy.decimals(targetCurrency)).to.equals(
        decimals,
      );
    });
  });

  describe('Update', async () => {
    const initialCompoundFactor = BigNumber.from(1000);
    const maturity = 1;
    const nextMaturity = 1000001;
    const fvAmount = BigNumber.from(2000);
    const decimals = 4;

    beforeEach(async () => {
      await genesisValueVaultCaller.initializeCurrencySetting(
        targetCurrency,
        decimals,
        initialCompoundFactor,
        maturity,
      );
    });

    it('Update the genesis value', async () => {
      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        alice.address,
        maturity,
        fvAmount,
      );

      const totalLendingSupply =
        await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
      const totalBorrowingSupply =
        await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

      expect(totalLendingSupply).to.equals(
        fvAmount
          .mul(BigNumber.from(10).pow(decimals))
          .div(initialCompoundFactor),
      );
      expect(totalBorrowingSupply).to.equals(0);
    });

    it('Update the genesis value after auto-rolls', async () => {
      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        alice.address,
        maturity,
        -fvAmount.mul(100),
      );

      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        mockReserveFund.address,
        maturity,
        -fvAmount,
      );

      await genesisValueVaultCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        nextMaturity,
        8000,
        3000,
      );

      await genesisValueVaultCaller.updateGenesisValueWithFutureValue(
        targetCurrency,
        alice.address,
        nextMaturity,
        fvAmount.mul(100),
      );

      const totalLendingSupply =
        await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
      const totalBorrowingSupply =
        await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

      const aliceBalance = await genesisValueVaultProxy.getBalance(
        targetCurrency,
        alice.address,
      );
      const rfBalance = await genesisValueVaultProxy.getBalance(
        targetCurrency,
        mockReserveFund.address,
      );

      expect(aliceBalance.abs()).to.equals(totalBorrowingSupply);
      expect(rfBalance).to.equals(totalLendingSupply);
    });
  });
});
