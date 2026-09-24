import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers, waffle } from 'hardhat';

const { loadFixture } = waffle;

describe('FundManagementLogic', function () {
  let owner: SignerWithAddress;
  let lib: Contract;

  const MAX_EXPOSURE_CURRENCIES = 5;

  before(async () => {
    [owner] = await ethers.getSigners();
  });

  async function deployOnceFixture() {
    // Deploy QuickSort library (dependency of FundManagementLogic)
    const QuickSort = await ethers.getContractFactory('QuickSort');
    const quickSort = await QuickSort.deploy();
    await quickSort.deployed();

    // Deploy FundManagementLogic library with QuickSort linked
    const FundManagementLogic = await ethers.getContractFactory(
      'FundManagementLogic',
      {
        libraries: {
          QuickSort: quickSort.address,
        },
      },
    );
    const fundManagementLogic = await FundManagementLogic.deploy();
    await fundManagementLogic.deployed();

    // Deploy FundManagementLogicCaller with library linked
    const FundManagementLogicCaller = await ethers.getContractFactory(
      'FundManagementLogicCaller',
      {
        libraries: {
          FundManagementLogic: fundManagementLogic.address,
        },
      },
    );
    const lib = await FundManagementLogicCaller.deploy();
    await lib.deployed();

    return { lib, owner };
  }

  beforeEach(async () => {
    ({ lib, owner } = await loadFixture(deployOnceFixture));
  });

  describe('registerCurrency', function () {
    let currencies: string[];

    beforeEach(async () => {
      // Create 6 different currencies for testing
      currencies = [];
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES + 1; i++) {
        const currency = ethers.utils.formatBytes32String(`Currency${i}`);
        currencies.push(currency);
      }
    });

    it('Should successfully register currencies less than MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES - 1 currencies
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES - 1; i++) {
        const isNewCurrency = await lib.callStatic.registerCurrency(
          currencies[i],
          owner.address,
        );
        await lib.registerCurrency(currencies[i], owner.address);
        expect(isNewCurrency).to.be.true;
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES - 1);
    });

    it('Should successfully register MAX_EXPOSURE_CURRENCIES currencies', async () => {
      // Register MAX_EXPOSURE_CURRENCIES currencies
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
        await lib.registerCurrency(currencies[i], owner.address);
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES);
    });

    it('Should return false when registering existing currency', async () => {
      // Register a currency
      await lib.registerCurrency(currencies[0], owner.address);

      // Register the same currency again - should return false
      const isNewCurrency = await lib.callStatic.registerCurrency(
        currencies[0],
        owner.address,
      );
      expect(isNewCurrency).to.be.false;
    });

    it('Should successfully register existing currency when at MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES currencies
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
        await lib.registerCurrency(currencies[i], owner.address);
      }

      // Register existing currency should succeed (no change in length)
      const isNewCurrency = await lib.callStatic.registerCurrency(
        currencies[0],
        owner.address,
      );
      await lib.registerCurrency(currencies[0], owner.address);

      expect(isNewCurrency).to.be.false;
      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES);
    });

    it('Should revert when registering new currency when at MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES currencies
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
        await lib.registerCurrency(currencies[i], owner.address);
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES);

      // Try to register a new (6th) currency - should revert
      await expect(
        lib.registerCurrency(
          currencies[MAX_EXPOSURE_CURRENCIES],
          owner.address,
        ),
      ).to.be.revertedWith('TooManyExposureCurrencies');
    });
  });

  describe('registerCurrencyAndMaturity', function () {
    let currencies: string[];
    const maturity = 1735689600; // 2025-01-01 00:00:00 UTC

    beforeEach(async () => {
      // Create 6 different currencies for testing
      currencies = [];
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES + 1; i++) {
        const currency = ethers.utils.formatBytes32String(`MatCurrency${i}`);
        currencies.push(currency);
      }
    });

    it('Should successfully register currency and maturity when less than MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES - 1 currencies with maturity
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES - 1; i++) {
        await lib.registerCurrencyAndMaturity(
          currencies[i],
          maturity,
          owner.address,
        );
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES - 1);

      // Verify maturity is registered for first currency
      const usedMaturitiesLength = await lib.getUsedMaturitiesLength(
        currencies[0],
        owner.address,
      );
      expect(usedMaturitiesLength).to.equal(1);

      const firstMaturity = await lib.getUsedMaturityAt(
        currencies[0],
        owner.address,
        0,
      );
      expect(firstMaturity).to.equal(maturity);
    });

    it('Should successfully register currency and maturity when at MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES currencies with maturity
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
        await lib.registerCurrencyAndMaturity(
          currencies[i],
          maturity,
          owner.address,
        );
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES);
    });

    it('Should return true when registering new currency and maturity', async () => {
      const isNewCurrency = await lib.callStatic.registerCurrencyAndMaturity(
        currencies[0],
        maturity,
        owner.address,
      );
      expect(isNewCurrency).to.be.true;
    });

    it('Should return false when registering existing maturity for existing currency', async () => {
      // Register currency and maturity
      await lib.registerCurrencyAndMaturity(
        currencies[0],
        maturity,
        owner.address,
      );

      // Register same currency and maturity again - should return false
      const isNewCurrency = await lib.callStatic.registerCurrencyAndMaturity(
        currencies[0],
        maturity,
        owner.address,
      );
      expect(isNewCurrency).to.be.false;
    });

    it('Should successfully register new maturity for existing currency when at MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES currencies with maturity
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
        await lib.registerCurrencyAndMaturity(
          currencies[i],
          maturity,
          owner.address,
        );
      }

      const maturity2 = maturity + 86400; // +1 day

      // Register new maturity for existing currency should succeed
      await lib.registerCurrencyAndMaturity(
        currencies[0],
        maturity2,
        owner.address,
      );

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES);

      const usedMaturitiesLength = await lib.getUsedMaturitiesLength(
        currencies[0],
        owner.address,
      );
      expect(usedMaturitiesLength).to.equal(2);
    });

    it('Should revert when registering new currency and maturity when at MAX_EXPOSURE_CURRENCIES', async () => {
      // Register MAX_EXPOSURE_CURRENCIES currencies with maturity
      for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
        await lib.registerCurrencyAndMaturity(
          currencies[i],
          maturity,
          owner.address,
        );
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(MAX_EXPOSURE_CURRENCIES);

      // Try to register a new (6th) currency with maturity - should revert
      await expect(
        lib.registerCurrencyAndMaturity(
          currencies[MAX_EXPOSURE_CURRENCIES],
          maturity,
          owner.address,
        ),
      ).to.be.revertedWith('TooManyExposureCurrencies');
    });

    it('Should not revert when registering same currency and maturity multiple times', async () => {
      // Register same currency and maturity multiple times
      for (let i = 0; i < 3; i++) {
        await lib.registerCurrencyAndMaturity(
          currencies[0],
          maturity,
          owner.address,
        );
      }

      const usedCurrenciesLength = await lib.getUsedCurrenciesLength(
        owner.address,
      );
      expect(usedCurrenciesLength).to.equal(1);

      const usedMaturitiesLength = await lib.getUsedMaturitiesLength(
        currencies[0],
        owner.address,
      );
      expect(usedMaturitiesLength).to.equal(1);
    });
  });
});
