import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../../common/constants';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ReserveFund = artifacts.require('ReserveFund');
const ProxyController = artifacts.require('ProxyController');
const WETH9 = artifacts.require('MockWETH9');
const MockERC20 = artifacts.require('MockERC20');
const TokenVaultCaller = artifacts.require('TokenVaultCaller');

// libraries
const DepositManagementLogic = artifacts.require('DepositManagementLogic');

// interfaces
const LendingMarket = artifacts.require('LendingMarket');

const { deployContract, deployMockContract } = waffle;

describe('TokenVault - Currencies', () => {
  let mockCurrencyController: MockContract;
  let mockLendingMarketController: MockContract;
  let mockReserveFund: MockContract;
  let mockWETH: MockContract;
  let mockERC20: MockContract;

  let tokenVaultProxy: Contract;
  let tokenVaultCaller: Contract;
  let depositManagementLogic: Contract;

  let owner: SignerWithAddress;
  let signers: SignerWithAddress[];

  const getUser = (): SignerWithAddress => {
    const signer = signers.shift();
    if (!signer) {
      throw new Error('No user exists');
    }
    return signer;
  };

  before(async () => {
    [owner, ...signers] = await ethers.getSigners();

    // Set up for the mocks
    mockCurrencyController = await deployMockContract(
      owner,
      CurrencyController.abi,
    );
    mockReserveFund = await deployMockContract(owner, ReserveFund.abi);
    mockLendingMarketController = await deployMockContract(
      owner,
      LendingMarketController.abi,
    );
    mockWETH = await deployMockContract(owner, WETH9.abi);
    mockERC20 = await deployMockContract(owner, MockERC20.abi);

    await mockWETH.mock.transferFrom.returns(true);
    await mockWETH.mock.transfer.returns(true);
    await mockWETH.mock.approve.returns(true);
    await mockWETH.mock.deposit.returns();
    await mockERC20.mock.transferFrom.returns(true);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.approve.returns(true);
    await mockERC20.mock.permit.returns();
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockLendingMarketController.mock.isTerminated.returns(false);
    await mockLendingMarketController.mock.cleanUpFunds.returns(0);
    await mockLendingMarketController.mock.getTotalPresentValueInBaseCurrency.returns(
      0,
    );
    await mockLendingMarketController.mock.calculateFunds.returns({
      workingLendOrdersAmount: 0,
      claimableAmount: 0,
      collateralAmount: 0,
      unallocatedCollateralAmount: 0,
      lentAmount: 0,
      workingBorrowOrdersAmount: 0,
      debtAmount: 0,
      borrowedAmount: 0,
    });
    await mockLendingMarketController.mock.getUsedCurrencies.returns([]);
    await mockLendingMarketController.mock.calculateTotalFundsInBaseCurrency.returns(
      {
        plusDepositAmountInAdditionalFundsCcy: 0,
        minusDepositAmountInAdditionalFundsCcy: 0,
        workingLendOrdersAmount: 0,
        claimableAmount: 0,
        collateralAmount: 0,
        lentAmount: 0,
        workingBorrowOrdersAmount: 0,
        debtAmount: 0,
        borrowedAmount: 0,
      },
    );

    // Deploy libraries
    depositManagementLogic = await deployContract(
      owner,
      DepositManagementLogic,
    );

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const tokenVault = await ethers
      .getContractFactory('TokenVault', {
        libraries: {
          DepositManagementLogic: depositManagementLogic.address,
        },
      })
      .then((factory) => factory.deploy());

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const tokenVaultAddress = await proxyController
      .setTokenVaultImpl(
        tokenVault.address,
        LIQUIDATION_THRESHOLD_RATE,
        FULL_LIQUIDATION_THRESHOLD_RATE,
        LIQUIDATION_PROTOCOL_FEE_RATE,
        LIQUIDATOR_FEE_RATE,
        mockWETH.address,
      )
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
    tokenVaultProxy = await ethers.getContractAt(
      'TokenVault',
      tokenVaultAddress,
    );

    // Deploy TokenVaultCaller
    tokenVaultCaller = await deployContract(owner, TokenVaultCaller, [
      tokenVaultProxy.address,
      mockLendingMarketController.address,
    ]);

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['CurrencyController', mockCurrencyController],
      ['TokenVault', tokenVaultProxy],
      ['ReserveFund', mockReserveFund],
      ['LendingMarketController', tokenVaultCaller],
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
    await migrationAddressResolver.buildCaches([tokenVaultProxy.address]);
  });

  beforeEach(async () => {
    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockLendingMarketController.mock.isTerminated.returns(false);
  });

  describe('Used Currencies', () => {
    let mockLendingMarket: MockContract;
    let currency1: string;
    let currency2: string;
    let currency3: string;

    before(async () => {
      currency1 = ethers.utils.formatBytes32String('Currency1');
      currency2 = ethers.utils.formatBytes32String('Currency2');
      currency3 = ethers.utils.formatBytes32String('Currency3');

      mockLendingMarket = await deployMockContract(owner, LendingMarket.abi);

      for (const currency of [currency1, currency2, currency3]) {
        await tokenVaultProxy.registerCurrency(
          currency,
          mockERC20.address,
          true,
        );
      }
    });

    it('Get used currencies when no currencies exist in LendingMarketController', async () => {
      const signer = getUser();
      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, currency1, '1000');

      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([]);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.deep.equal([currency1]);
    });

    it('Get used currencies when currency exists in LendingMarketController but no borrow orders', async () => {
      const signer = getUser();
      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, currency1, '1000');

      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([currency2]);
      await mockLendingMarketController.mock.getLendingMarket.returns(
        mockLendingMarket.address,
      );
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency2, signer.address)
        .returns([123456]);
      await mockLendingMarketController.mock.getOrderBookId.returns(1);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(1, signer.address)
        .returns([], []);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.deep.equal([currency1]);
    });

    it('Get used currencies with inactive borrow orders without duplicate', async () => {
      const signer = getUser();
      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, currency1, '1000');

      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([currency2]);
      await mockLendingMarketController.mock.getLendingMarket.returns(
        mockLendingMarket.address,
      );
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency2, signer.address)
        .returns([123456]);
      await mockLendingMarketController.mock.getOrderBookId.returns(1);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(1, signer.address)
        .returns([], [1, 2, 3]);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.have.lengthOf(2);
      expect(usedCurrencies).to.include(currency1);
      expect(usedCurrencies).to.include(currency2);
    });

    it('Get used currencies with inactive borrow orders with duplicate in deposit currencies', async () => {
      const signer = getUser();
      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, currency1, '1000');

      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([currency1]);
      await mockLendingMarketController.mock.getLendingMarket.returns(
        mockLendingMarket.address,
      );
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency1, signer.address)
        .returns([123456]);
      await mockLendingMarketController.mock.getOrderBookId.returns(1);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(1, signer.address)
        .returns([], [1, 2]);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.deep.equal([currency1]);
    });

    it('Get used currencies with multiple lending currencies having inactive borrow orders', async () => {
      const signer = getUser();
      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, currency1, '1000');

      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([currency2, currency3]);
      await mockLendingMarketController.mock.getLendingMarket.returns(
        mockLendingMarket.address,
      );
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency2, signer.address)
        .returns([123456, 789012]);
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency3, signer.address)
        .returns([123456, 789012]);
      await mockLendingMarketController.mock.getOrderBookId.returns(1);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(1, signer.address)
        .returns([], [1, 2]);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.have.lengthOf(3);
      expect(usedCurrencies).to.include(currency1);
      expect(usedCurrencies).to.include(currency2);
      expect(usedCurrencies).to.include(currency3);
    });

    it('Get used currencies when only one maturity has inactive borrow orders', async () => {
      const signer = getUser();
      await tokenVaultCaller
        .connect(signer)
        .addDepositAmount(signer.address, currency1, '1000');

      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([currency2]);
      await mockLendingMarketController.mock.getLendingMarket.returns(
        mockLendingMarket.address,
      );

      const maturity1 = 123456;
      const maturity2 = 234567;
      const maturity3 = 345678;
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency2, signer.address)
        .returns([maturity1, maturity2, maturity3]);

      await mockLendingMarketController.mock.getOrderBookId
        .withArgs(currency2, maturity1)
        .returns(1);
      await mockLendingMarketController.mock.getOrderBookId
        .withArgs(currency2, maturity2)
        .returns(2);
      await mockLendingMarketController.mock.getOrderBookId
        .withArgs(currency2, maturity3)
        .returns(3);

      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(1, signer.address)
        .returns([], []);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(2, signer.address)
        .returns([], [5, 6]);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(3, signer.address)
        .returns([], []);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.have.lengthOf(2);
      expect(usedCurrencies).to.include(currency1);
      expect(usedCurrencies).to.include(currency2);
    });

    it('Get used currencies when no deposit currencies exist', async () => {
      const signer = getUser();
      await mockLendingMarketController.mock.getUsedCurrencies
        .withArgs(signer.address)
        .returns([currency2]);
      await mockLendingMarketController.mock.getLendingMarket.returns(
        mockLendingMarket.address,
      );
      await mockLendingMarketController.mock.getUsedMaturities
        .withArgs(currency2, signer.address)
        .returns([123456]);
      await mockLendingMarketController.mock.getOrderBookId.returns(1);
      await mockLendingMarket.mock.getBorrowOrderIds
        .withArgs(1, signer.address)
        .returns([], [1]);

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );

      expect(usedCurrencies).to.deep.equal([currency2]);
    });
  });

  describe('Used Currency Restriction', () => {
    let currencies: string[];
    const MAX_DEPOSIT_CURRENCIES = 10;

    before(async () => {
      // Prepare currency names (using unique names to avoid conflicts)
      currencies = [];
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES + 1; i++) {
        const currency = ethers.utils.formatBytes32String(`MaxCurrency${i}`);
        currencies.push(currency);
      }

      // Register 11 currencies for testing
      for (const currency of currencies) {
        await tokenVaultProxy.registerCurrency(
          currency,
          mockERC20.address,
          true,
        );
      }
    });

    beforeEach(async () => {
      await mockLendingMarketController.mock.isRedemptionRequired.returns(
        false,
      );
    });

    it('Should successfully deposit when usedCurrencies is less than MAX_DEPOSIT_CURRENCIES', async () => {
      const signer = getUser();

      // Deposit MAX_DEPOSIT_CURRENCIES - 1 currencies
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES - 1; i++) {
        await tokenVaultProxy.connect(signer).deposit(currencies[i], '1000');
      }

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES - 1);
    });

    it('Should successfully deposit when usedCurrencies equals MAX_DEPOSIT_CURRENCIES', async () => {
      const signer = getUser();

      // Deposit MAX_DEPOSIT_CURRENCIES currencies
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES; i++) {
        await tokenVaultProxy.connect(signer).deposit(currencies[i], '1000');
      }

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
    });

    it('Should successfully deposit to an existing currency when already at MAX_DEPOSIT_CURRENCIES', async () => {
      const signer = getUser();

      // Deposit MAX_DEPOSIT_CURRENCIES currencies
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES; i++) {
        await tokenVaultProxy.connect(signer).deposit(currencies[i], '1000');
      }

      // Additional deposit to an existing currency should succeed
      await tokenVaultProxy.connect(signer).deposit(currencies[0], '500');

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
    });

    it('Should revert when trying to deposit a new currency when usedCurrencies equals MAX_DEPOSIT_CURRENCIES', async () => {
      const signer = getUser();

      // Deposit MAX_DEPOSIT_CURRENCIES currencies
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES; i++) {
        await tokenVaultProxy.connect(signer).deposit(currencies[i], '1000');
      }

      // Try to deposit a new (11th) currency - should revert
      await expect(
        tokenVaultProxy
          .connect(signer)
          .deposit(currencies[MAX_DEPOSIT_CURRENCIES], '1000'),
      ).to.be.revertedWith('TooManyDepositCurrencies');

      await expect(
        tokenVaultProxy
          .connect(owner)
          .depositTo(
            currencies[MAX_DEPOSIT_CURRENCIES],
            '1000',
            signer.address,
          ),
      ).to.be.revertedWith('TooManyDepositCurrencies');

      const canDepositCurrency = await tokenVaultProxy.canDepositCurrency(
        signer.address,
        currencies[MAX_DEPOSIT_CURRENCIES],
      );
      expect(canDepositCurrency).to.be.false;
    });

    it('Should successfully deposit a new currency after withdrawing all from one currency', async () => {
      const signer = getUser();

      // Set up mocks for withdraw
      await mockCurrencyController.mock[
        'convertToBaseCurrency(bytes32,uint256)'
      ].returns('1000');

      // Deposit MAX_DEPOSIT_CURRENCIES currencies
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES; i++) {
        await tokenVaultProxy.connect(signer).deposit(currencies[i], '1000');
      }

      // Withdraw all from one currency to free up a slot
      await tokenVaultProxy.connect(signer).withdraw(currencies[0], '1000');

      const usedCurrenciesAfterWithdraw =
        await tokenVaultProxy.getUsedCurrencies(signer.address);
      expect(usedCurrenciesAfterWithdraw).to.have.lengthOf(
        MAX_DEPOSIT_CURRENCIES - 1,
      );

      // Now deposit a new currency should succeed
      await tokenVaultProxy
        .connect(signer)
        .deposit(currencies[MAX_DEPOSIT_CURRENCIES], '1000');

      const usedCurrenciesAfterDeposit =
        await tokenVaultProxy.getUsedCurrencies(signer.address);
      expect(usedCurrenciesAfterDeposit).to.have.lengthOf(
        MAX_DEPOSIT_CURRENCIES,
      );
    });

    it('Should allow usedCurrencies to exceed MAX_DEPOSIT_CURRENCIES when using addDepositAmount directly', async () => {
      const signer = getUser();

      // Use addDepositAmount to bypass the MAX_DEPOSIT_CURRENCIES check
      // This simulates a state where usedCurrencies exceeds the limit
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES + 1; i++) {
        await tokenVaultCaller
          .connect(signer)
          .addDepositAmount(signer.address, currencies[i], '1000');
      }

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES + 1);
      expect(usedCurrencies.length).to.be.greaterThan(MAX_DEPOSIT_CURRENCIES);
    });

    it('Should allow deposit to existing currency when usedCurrencies exceeds MAX_DEPOSIT_CURRENCIES', async () => {
      const signer = getUser();

      // Create a state where usedCurrencies exceeds MAX_DEPOSIT_CURRENCIES
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES + 1; i++) {
        await tokenVaultCaller
          .connect(signer)
          .addDepositAmount(signer.address, currencies[i], '1000');
      }

      const usedCurrenciesBefore = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrenciesBefore).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES + 1);

      // Deposit to an existing currency should succeed
      await tokenVaultProxy.connect(signer).deposit(currencies[0], '500');

      const usedCurrenciesAfter = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrenciesAfter).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES + 1);
    });

    it('Should revert when depositing new currency when usedCurrencies exceeds MAX_DEPOSIT_CURRENCIES', async () => {
      const signer = getUser();

      // Create a state where usedCurrencies exceeds MAX_DEPOSIT_CURRENCIES
      for (let i = 0; i < MAX_DEPOSIT_CURRENCIES + 1; i++) {
        await tokenVaultCaller
          .connect(signer)
          .addDepositAmount(signer.address, currencies[i], '1000');
      }

      const usedCurrencies = await tokenVaultProxy.getUsedCurrencies(
        signer.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES + 1);

      // Register an additional currency for testing
      const newCurrency = ethers.utils.formatBytes32String('NewCurrency');
      await tokenVaultProxy.registerCurrency(
        newCurrency,
        mockERC20.address,
        true,
      );

      // Try to deposit a new currency - should revert
      await expect(
        tokenVaultProxy.connect(signer).deposit(newCurrency, '1000'),
      ).to.be.revertedWith('TooManyDepositCurrencies');
    });
  });
});
