import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import {
  hexETH,
  hexUSDC,
  hexWBTC,
  hexWFIL,
  toBytes32,
} from '../../utils/strings';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  HAIRCUT,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PCT_DIGIT,
} from '../common/constants';
import {
  usdcToETHRate,
  wFilToETHRate,
  wbtcToETHRate,
} from '../common/currencies';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Used Currencies Restriction', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let reserveFund: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;
  let wFILToken: Contract;
  let wBTCToken: Contract;
  let usdcToUSDPriceFeed: Contract;

  let genesisDate: number;

  let signers: Signers;

  const MAX_DEPOSIT_CURRENCIES = 10;
  const MAX_EXPOSURE_CURRENCIES = 5;

  // Initial token balances for owner and users
  const initialFILBalance = BigNumber.from('10000000000000000000000'); // 10,000 WFIL
  const initialUSDCBalance = BigNumber.from('10000000000'); // 10,000 USDC (6 decimals)
  const initialWBTCBalance = BigNumber.from('10000000'); // 0.1 WBTC (8 decimals)

  // Deposit amounts for different tokens
  const depositAmounts: Record<string, BigNumber> = {
    [hexETH]: BigNumber.from('100000000000000000'), // 0.1 ETH
    [hexUSDC]: BigNumber.from('10000000'), // 10 USDC - leave room for additional USDC-based currencies
    [hexWFIL]: BigNumber.from('10000000000000000000'), // 10 WFIL
    [hexWBTC]: BigNumber.from('100000'), // 0.001 WBTC
  };

  const borrowAmount = BigNumber.from('10000000000000000'); // 0.01 ETH equivalent
  const borrowUnitPrice = '9000';

  // Helper function to convert ETH amount to other currencies
  const convertToTokenAmount = (
    ethAmount: BigNumber,
    currency: string,
  ): BigNumber => {
    if (currency === hexETH) {
      return ethAmount;
    } else if (currency === hexWFIL) {
      return ethAmount.mul(BigNumber.from(10).pow(18)).div(wFilToETHRate);
    } else if (currency === hexWBTC) {
      return ethAmount.mul(BigNumber.from(10).pow(8)).div(wbtcToETHRate);
    } else if (
      currency === hexUSDC ||
      additionalCurrencies.includes(currency)
    ) {
      return ethAmount.mul(BigNumber.from(10).pow(6)).div(usdcToETHRate);
    }
    return ethAmount;
  };

  // Helper function to create additional currencies (USDC2, USDC3, etc.)
  const additionalCurrencies: string[] = [];
  const createAdditionalCurrencies = (count: number) => {
    for (let i = 0; i < count; i++) {
      const currency = toBytes32(`USDC${i + 2}`); // USDC2, USDC3, ...
      additionalCurrencies.push(currency);
      // Deposit amount will be set in the before hook
    }
  };

  // Token contracts mapping
  const tokenContracts: Record<string, Contract> = {};

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
      await usdcToken
        .connect(owner)
        .transfer(signer.address, initialUSDCBalance);
      await wBTCToken
        .connect(owner)
        .transfer(signer.address, initialWBTCBalance);
    });

  // Helper function to deposit a currency
  const depositCurrency = async (
    user: SignerWithAddress,
    currency: string,
    amount: BigNumber,
  ) => {
    const token = tokenContracts[currency];

    if (currency === hexETH) {
      await tokenVault.connect(user).deposit(currency, amount, {
        value: amount,
      });
    } else {
      await token.connect(user).approve(tokenVault.address, amount);
      await tokenVault.connect(user).deposit(currency, amount);
    }
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      currencyController,
      tokenVault,
      lendingMarketController,
      reserveFund,
      wETHToken,
      usdcToken,
      wFILToken,
      wBTCToken,
      usdcToUSDPriceFeed,
    } = await deployContracts());

    // Setup token contracts mapping
    tokenContracts[hexETH] = wETHToken; // Native ETH uses wETH for approval
    tokenContracts[hexUSDC] = usdcToken;
    tokenContracts[hexWFIL] = wFILToken;
    tokenContracts[hexWBTC] = wBTCToken;

    // Update base currencies to be collateral currencies
    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);
    await tokenVault.updateCurrency(hexWFIL, true);
    await tokenVault.updateCurrency(hexWBTC, true);

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      FULL_LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    // Create order books for base currencies
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexETH,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexUSDC,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexWBTC,
        genesisDate,
        genesisDate,
      );
    }

    // Set order fee rate to 0 for base currencies to prevent fees from going to ReserveFund
    await lendingMarketController.updateOrderFeeRate(hexETH, '0');
    await lendingMarketController.updateOrderFeeRate(hexWFIL, '0');
    await lendingMarketController.updateOrderFeeRate(hexUSDC, '0');
    await lendingMarketController.updateOrderFeeRate(hexWBTC, '0');

    // Create additional currencies (USDC2-USDC13) using USDC token
    // This allows us to reach 16 currencies: ETH, WFIL, WBTC, USDC, USDC2-USDC13
    // (need 16 to test the MAX limit of 10 + 5)
    createAdditionalCurrencies(12);
    // Use smaller amounts for additional currencies since they all use the same USDC token
    const additionalCurrencyAmount = BigNumber.from('1000000'); // 1 USDC (6 decimals)
    for (const currency of additionalCurrencies) {
      tokenContracts[currency] = usdcToken; // Additional currencies use USDC token
      // Set smaller deposit amount to avoid running out of USDC tokens
      depositAmounts[currency] = additionalCurrencyAmount;

      // Register currency in CurrencyController using USDC's price feed
      await currencyController.addCurrency(
        currency,
        '6', // USDC decimals
        HAIRCUT,
        [usdcToUSDPriceFeed.address], // Use USDC price feed for USDC-based currencies
        [86400],
      );

      // Register currency in TokenVault using USDC token
      await tokenVault.registerCurrency(currency, usdcToken.address, false);

      // Update currency to be used as collateral
      await tokenVault.updateCurrency(currency, true);

      // Initialize lending market for the currency
      await lendingMarketController.initializeLendingMarket(
        currency,
        genesisDate,
        PCT_DIGIT,
        '0',
        '2000',
        '8000',
      );

      // Create order book
      for (let i = 0; i < 8; i++) {
        await lendingMarketController.createOrderBook(
          currency,
          genesisDate,
          genesisDate,
        );
      }
    }
  });

  describe('MAX_DEPOSIT_CURRENCIES (deposit only)', () => {
    it('Should successfully deposit to less than MAX_DEPOSIT_CURRENCIES currencies', async () => {
      [alice] = await getUsers(1);

      // First test with only base currencies (no additional currencies)
      const baseCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH];

      for (const currency of baseCurrencies) {
        await depositCurrency(alice, currency, depositAmounts[currency]);
      }

      // Now add some additional currencies
      for (let i = 0; i < 5; i++) {
        const currency = additionalCurrencies[i];
        await depositCurrency(alice, currency, depositAmounts[currency]);
      }

      const usedCurrencies = await tokenVault.getUsedCurrencies(alice.address);
      expect(usedCurrencies).to.have.lengthOf(9);
    });

    it('Should successfully deposit to MAX_DEPOSIT_CURRENCIES currencies', async () => {
      [alice] = await getUsers(1);

      // Deposit to 10 currencies (4 existing + 6 additional)
      const currencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
        additionalCurrencies.slice(0, 6),
      );

      for (const currency of currencies) {
        await depositCurrency(alice, currency, depositAmounts[currency]);
      }

      const usedCurrencies = await tokenVault.getUsedCurrencies(alice.address);
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
    });

    it('Should revert when depositing to new currency when at MAX_DEPOSIT_CURRENCIES', async () => {
      [alice] = await getUsers(1);

      // Deposit to 10 currencies
      const currencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
        additionalCurrencies.slice(0, 6),
      );

      for (const currency of currencies) {
        await depositCurrency(alice, currency, depositAmounts[currency]);
      }

      const usedCurrencies = await tokenVault.getUsedCurrencies(alice.address);
      expect(usedCurrencies).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);

      // Try to deposit to 11th currency
      const eleventhCurrency = additionalCurrencies[6];
      await expect(
        depositCurrency(
          alice,
          eleventhCurrency,
          depositAmounts[eleventhCurrency],
        ),
      ).to.be.revertedWith('TooManyDepositCurrencies');
    });
  });

  describe('FundManagementLogic MAX_EXPOSURE_CURRENCIES (executeOrder only)', () => {
    it('Should successfully execute orders for less than MAX_EXPOSURE_CURRENCIES currencies', async () => {
      [alice, bob] = await getUsers(2);

      // Execute BORROW orders for 4 currencies (less than MAX=5)
      const currencies = [hexWFIL, hexWBTC, hexUSDC, hexETH];

      // First, deposit collateral for all currencies
      // Use the predefined deposit amounts which are within alice's balance
      for (const currency of currencies) {
        const depositAmount = convertToTokenAmount(
          borrowAmount.mul(2),
          currency,
        );
        await depositCurrency(alice, currency, depositAmount);
      }

      // Then execute borrow orders
      for (const currency of currencies) {
        const maturities = await lendingMarketController.getMaturities(
          currency,
        );

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            currency,
            maturities[0],
            Side.BORROW,
            convertToTokenAmount(borrowAmount, currency).toString(),
            borrowUnitPrice,
          );
      }

      const usedCurrencies = await lendingMarketController.getUsedCurrencies(
        alice.address,
      );
      expect(usedCurrencies).to.have.lengthOf(4);
    });

    it('Should successfully execute orders for MAX_EXPOSURE_CURRENCIES currencies', async () => {
      [alice, bob] = await getUsers(2);

      // Execute BORROW orders for 5 currencies (4 existing + 1 additional, MAX=5)
      const currencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
        additionalCurrencies.slice(0, 1),
      );

      // First, deposit collateral for all currencies
      // Convert ETH amount to each currency's native units
      for (const currency of currencies) {
        const depositAmount = convertToTokenAmount(
          borrowAmount.mul(2),
          currency,
        );
        await depositCurrency(alice, currency, depositAmount);
      }

      // Then execute borrow orders
      for (const currency of currencies) {
        const maturities = await lendingMarketController.getMaturities(
          currency,
        );
        const orderAmount = convertToTokenAmount(borrowAmount, currency);

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            currency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            borrowUnitPrice,
          );
      }

      const usedCurrencies = await lendingMarketController.getUsedCurrencies(
        alice.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_EXPOSURE_CURRENCIES);
    });

    it('Should revert when executing order for new currency when at MAX_EXPOSURE_CURRENCIES', async () => {
      [alice, bob] = await getUsers(2);

      // Execute BORROW orders for 5 currencies (MAX=5)
      const currencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
        additionalCurrencies.slice(0, 1),
      );

      // Also prepare the 6th currency
      const sixthCurrency = additionalCurrencies[1];
      const allCurrencies = currencies.concat([sixthCurrency]);

      // First, deposit collateral for all currencies including the 6th
      // Convert ETH amount to each currency's native units
      for (const currency of allCurrencies) {
        const depositAmount = convertToTokenAmount(
          borrowAmount.mul(2),
          currency,
        );
        await depositCurrency(alice, currency, depositAmount);
      }

      // Execute borrow orders for 5 currencies
      for (const currency of currencies) {
        const maturities = await lendingMarketController.getMaturities(
          currency,
        );
        const orderAmount = convertToTokenAmount(borrowAmount, currency);

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            currency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            borrowUnitPrice,
          );
      }

      const usedCurrencies = await lendingMarketController.getUsedCurrencies(
        alice.address,
      );
      expect(usedCurrencies).to.have.lengthOf(MAX_EXPOSURE_CURRENCIES);

      // Try to execute order for 6th currency - should fail
      const maturities = await lendingMarketController.getMaturities(
        sixthCurrency,
      );
      const orderAmount = convertToTokenAmount(borrowAmount, sixthCurrency);

      await expect(
        lendingMarketController
          .connect(alice)
          .executeOrder(
            sixthCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            borrowUnitPrice,
          ),
      ).to.be.revertedWith('TooManyExposureCurrencies');
    });
  });

  describe('Combined deposit and executeOrder with Borrow', () => {
    describe('Should fail to create borrow order for new currency when TokenVault MAX reached', async () => {
      before(async () => {
        [alice, bob] = await getUsers(2);
      });

      it('Deposit to MAX currencies', async () => {
        const depositCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
          additionalCurrencies.slice(0, 6),
        );

        for (const currency of depositCurrencies) {
          const depositAmount = convertToTokenAmount(
            borrowAmount.mul(2),
            currency,
          );
          await depositCurrency(alice, currency, depositAmount);
        }

        const usedCurrenciesInVault1 = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault1).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
      });

      it('Fail to deposit to new currency when at MAX', async () => {
        const newCurrency = additionalCurrencies[6]; // USDC7

        await expect(
          depositCurrency(alice, newCurrency, BigNumber.from('1')),
        ).to.be.revertedWith('TooManyDepositCurrencies');
      });

      it('Fail to execute an borrow order on NEW currency when at MAX_DEPOSIT_CURRENCIES', async () => {
        const newCurrency = additionalCurrencies[6]; // USDC7
        const maturities = await lendingMarketController.getMaturities(
          newCurrency,
        );

        // Execute borrow order on NEW currency (11th currency - USDC7) should also fail
        // because the new implementation prevents creating borrow orders when deposit side is at MAX
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              newCurrency,
              maturities[0],
              Side.BORROW,
              BigNumber.from(1),
              borrowUnitPrice,
            ),
        ).to.be.revertedWith('TooManyDepositCurrencies');
      });
    });

    describe('Should fail to create borrow order for new currency when TokenVault MAX exceeded by borrow orders', async () => {
      before(async () => {
        [alice, bob] = await getUsers(2);
      });

      it('Deposit to MAX - 1 currencies', async () => {
        // Step 1: Deposit to 9 currencies in TokenVault (reaching MAX - 1)
        const depositCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
          additionalCurrencies.slice(0, 5),
        );

        for (const currency of depositCurrencies) {
          const depositAmount = convertToTokenAmount(
            borrowAmount.mul(2),
            currency,
          );
          await depositCurrency(alice, currency, depositAmount);
        }

        const usedCurrenciesInVault1 = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault1).to.have.lengthOf(
          MAX_DEPOSIT_CURRENCIES - 1,
        );
      });

      it('Execute borrow orders on NEW currencies until reaching MAX by borrow orders', async () => {
        // Execute borrow orders on NEW currency
        for (let i = 0; i < MAX_EXPOSURE_CURRENCIES; i++) {
          const newCurrency = additionalCurrencies[i + 5]; // USDC7 to USDC11
          const maturities = await lendingMarketController.getMaturities(
            newCurrency,
          );
          const orderAmount = convertToTokenAmount(borrowAmount, newCurrency);

          await lendingMarketController
            .connect(alice)
            .executeOrder(
              newCurrency,
              maturities[0],
              Side.BORROW,
              orderAmount,
              borrowUnitPrice,
            );
        }

        const usedCurrencies = await lendingMarketController.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrencies).to.have.lengthOf(MAX_EXPOSURE_CURRENCIES);
      });

      it('Fail to execute an borrow order on another NEW currency when at MAX_EXPOSURE_CURRENCIES', async () => {
        // Execution of borrow order on the 6th new currency (USDC12) should fail because there are already 5 active borrow orders on new currencies,
        // even though the deposit side is at MAX - 1
        const maturities = await lendingMarketController.getMaturities(
          additionalCurrencies[10],
        );
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              additionalCurrencies[10],
              maturities[0],
              Side.BORROW,
              BigNumber.from('1'),
              0,
            ),
        ).to.be.revertedWith('TooManyExposureCurrencies');
      });

      it('Deposit the 10th currency when at MAX - 1 and verify used currencies', async () => {
        // Step 5: Deposit to the 10th currency (USDC12) in TokenVault (reaching MAX)
        const newCurrency = additionalCurrencies[10]; // USDC12
        await depositCurrency(alice, newCurrency, BigNumber.from('1'));

        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
      });

      it('Fill the borrow orders and verify used currencies', async () => {
        // Fill all borrow orders to add them to deposit side
        const usedCurrencies = await lendingMarketController.getUsedCurrencies(
          alice.address,
        );

        for (const currency of usedCurrencies) {
          const maturities = await lendingMarketController.getMaturities(
            currency,
          );
          const orderAmount = convertToTokenAmount(borrowAmount, currency);

          await depositCurrency(bob, currency, orderAmount);
          await lendingMarketController
            .connect(bob)
            .executeOrder(currency, maturities[0], Side.LEND, orderAmount, 0);
        }

        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(
          MAX_DEPOSIT_CURRENCIES + MAX_EXPOSURE_CURRENCIES,
        );
      });
    });

    describe('Should fail to deposit after withdrawing all balance in the currency from Borrow order when at MAX_DEPOSIT_CURRENCIES', async () => {
      before(async () => {
        [alice, bob] = await getUsers(2);
      });

      it('Deposit to MAX - 1 currencies', async () => {
        // Step 1: Deposit to 9 currencies in TokenVault (reaching MAX - 1)
        const depositCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
          additionalCurrencies.slice(0, 5),
        );

        for (const currency of depositCurrencies) {
          const depositAmount = convertToTokenAmount(
            borrowAmount.mul(2),
            currency,
          );
          await depositCurrency(alice, currency, depositAmount);
        }

        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(
          MAX_DEPOSIT_CURRENCIES - 1,
        );
      });

      it('Create Borrow order in a currency not used in deposits, and another user fills it', async () => {
        // Step 2: Create Borrow order in a new currency (not in the 9 deposited currencies)
        const borrowCurrency = additionalCurrencies[5]; // USDC6 (not in the deposited currencies)
        const maturities = await lendingMarketController.getMaturities(
          borrowCurrency,
        );
        const orderAmount = convertToTokenAmount(borrowAmount, borrowCurrency);

        // Alice creates a borrow order
        await lendingMarketController
          .connect(alice)
          .executeOrder(
            borrowCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            borrowUnitPrice,
          );

        // Step 3: Bob fills the borrow order
        await depositCurrency(bob, borrowCurrency, orderAmount);
        await lendingMarketController
          .connect(bob)
          .executeOrder(
            borrowCurrency,
            maturities[0],
            Side.LEND,
            orderAmount,
            0,
          );

        // Verify that Alice now has 11 currencies in TokenVault
        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
      });

      it('Deposit the 10th currency when at MAX - 1 and verify used currencies', async () => {
        // Step 5: Deposit to the 10th currency (USDC12) in TokenVault (reaching MAX)
        const newCurrency = additionalCurrencies[10]; // USDC12
        await depositCurrency(alice, newCurrency, BigNumber.from('1'));

        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(
          MAX_DEPOSIT_CURRENCIES + 1,
        );
      });

      it('Deposit again in the same currency from Borrow order should succeed', async () => {
        // Step 4: Deposit again in the same currency that was added through the Borrow order
        const borrowCurrency = additionalCurrencies[5]; // USDC6

        // This should succeed because we're depositing to an existing currency (not adding a new one)
        // Even though total deposit currencies is at MAX + 1, depositing to existing currency should work
        await depositCurrency(alice, borrowCurrency, BigNumber.from('1'));

        // Verify that the number of currencies remains the same (MAX + 1)
        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(
          MAX_DEPOSIT_CURRENCIES + 1,
        );
      });

      it('Withdraw all balance in the currency from Borrow order', async () => {
        // Step 6: Withdraw all balance in the currency that was added through the Borrow order
        const borrowCurrency = additionalCurrencies[5]; // USDC6
        const balance = await tokenVault.getDepositAmount(
          alice.address,
          borrowCurrency,
        );

        // Withdraw all balance
        await tokenVault.connect(alice).withdraw(borrowCurrency, balance);

        // Verify that the number of currencies decreased to MAX
        let usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
      });

      it('Fail to deposit again in the same currency from Borrow order', async () => {
        // Step 7: Try to deposit again in the same currency after withdrawal
        // This should fail because we're now at MAX currencies and trying to add a new currency
        const borrowCurrency = additionalCurrencies[5]; // USDC6
        await expect(
          depositCurrency(alice, borrowCurrency, BigNumber.from('1')),
        ).to.be.revertedWith('TooManyDepositCurrencies');
      });
    });

    describe('Should fail to deposit to canceled Borrow order currency when at MAX_DEPOSIT_CURRENCIES', async () => {
      before(async () => {
        [alice, bob] = await getUsers(2);
      });

      it('Deposit to MAX - 1 currencies', async () => {
        // Step 1: Deposit to 9 currencies in TokenVault (reaching MAX - 1)
        const depositCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
          additionalCurrencies.slice(0, 5),
        );

        for (const currency of depositCurrencies) {
          const depositAmount = convertToTokenAmount(
            borrowAmount.mul(2),
            currency,
          );
          await depositCurrency(alice, currency, depositAmount);
        }

        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(
          MAX_DEPOSIT_CURRENCIES - 1,
        );
      });

      it('Create Borrow order in a currency not used in deposits', async () => {
        // Step 2: Create Borrow order in a new currency (not in the 9 deposited currencies)
        const borrowCurrency = additionalCurrencies[5]; // USDC6
        const maturities = await lendingMarketController.getMaturities(
          borrowCurrency,
        );
        const orderAmount = convertToTokenAmount(borrowAmount, borrowCurrency);

        // Alice creates a borrow order
        await lendingMarketController
          .connect(alice)
          .executeOrder(
            borrowCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            borrowUnitPrice,
          );

        const usedCurrencies = await lendingMarketController.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrencies).to.include(borrowCurrency);
      });

      it('Deposit in a different currency from Borrow order', async () => {
        // Step 3: Deposit in a different currency (not the one used in Borrow order)
        const newDepositCurrency = additionalCurrencies[6]; // USDC7
        const depositAmount = convertToTokenAmount(
          borrowAmount.mul(2),
          newDepositCurrency,
        );
        await depositCurrency(alice, newDepositCurrency, depositAmount);

        // Verify that we now have MAX currencies in deposit
        const usedCurrenciesInVault = await tokenVault.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrenciesInVault).to.have.lengthOf(MAX_DEPOSIT_CURRENCIES);
      });

      it('Cancel the Borrow order', async () => {
        // Step 4: Cancel the Borrow order
        const borrowCurrency = additionalCurrencies[5]; // USDC6
        const maturities = await lendingMarketController.getMaturities(
          borrowCurrency,
        );

        // Get the lending market contract
        const lendingMarket = await lendingMarketController
          .getLendingMarket(borrowCurrency)
          .then((address: string) =>
            ethers.getContractAt('LendingMarket', address),
          );

        // Get the order book ID (use the first one which matches maturities[0])
        const orderBookIds = await lendingMarketController.getOrderBookIds(
          borrowCurrency,
        );
        const orderBookId = orderBookIds[0];

        // Get the order ID using getBorrowOrderIds
        const { activeOrderIds } = await lendingMarket.getBorrowOrderIds(
          orderBookId,
          alice.address,
        );

        expect(activeOrderIds.length).to.be.greaterThan(0);
        const borrowOrderId = activeOrderIds[0];

        await lendingMarketController
          .connect(alice)
          .cancelOrder(borrowCurrency, maturities[0], borrowOrderId);

        // Clean up funds to remove the currency from used currencies
        await lendingMarketController.cleanUpFunds(
          borrowCurrency,
          alice.address,
        );

        // Verify that the Borrow order currency is no longer in used currencies
        const usedCurrencies = await lendingMarketController.getUsedCurrencies(
          alice.address,
        );
        expect(usedCurrencies).to.not.include(borrowCurrency);
      });

      it('Fail to deposit in the canceled Borrow order currency', async () => {
        // Step 5: Try to deposit in the same currency as the canceled Borrow order
        const borrowCurrency = additionalCurrencies[5]; // USDC6

        // This should fail because we're at MAX currencies and trying to add a new currency
        await expect(
          depositCurrency(alice, borrowCurrency, BigNumber.from('1')),
        ).to.be.revertedWith('TooManyDepositCurrencies');
      });
    });
  });

  describe('ReserveFund used currencies (no restriction)', () => {
    describe('Should allow ReserveFund to exceed MAX_EXPOSURE_CURRENCIES through order fees', () => {
      before(async () => {
        [alice, bob, carol, dave] = await getUsers(4);

        // Update order fee rate for currencies used in this test to generate fees
        const testCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
          additionalCurrencies.slice(0, 2), // USDC2 and USDC3
        );

        for (const currency of testCurrencies) {
          await lendingMarketController.updateOrderFeeRate(currency, '100');
        }
      });

      it('Verify ReserveFund starts with 0 currencies', async () => {
        const reserveFundCurrencies =
          await lendingMarketController.getUsedCurrencies(reserveFund.address);
        expect(reserveFundCurrencies).to.have.lengthOf(0);
      });

      it('Execute orders in 5 currencies to reach MAX_EXPOSURE_CURRENCIES', async () => {
        const aliceCurrencies = [hexWFIL, hexWBTC, hexUSDC, hexETH].concat(
          additionalCurrencies.slice(0, 1),
        );

        for (const currency of aliceCurrencies) {
          const depositAmount = convertToTokenAmount(
            borrowAmount.mul(2),
            currency,
          );
          await depositCurrency(alice, currency, depositAmount);
        }

        for (const currency of aliceCurrencies) {
          const maturities = await lendingMarketController.getMaturities(
            currency,
          );
          const orderAmount = convertToTokenAmount(borrowAmount, currency);

          await lendingMarketController
            .connect(alice)
            .executeOrder(
              currency,
              maturities[0],
              Side.BORROW,
              orderAmount,
              borrowUnitPrice,
            );

          await depositCurrency(bob, currency, orderAmount);
          await lendingMarketController
            .connect(bob)
            .executeOrder(currency, maturities[0], Side.LEND, orderAmount, 0);
        }

        // Verify Alice is at MAX
        const aliceUsedCurrencies =
          await lendingMarketController.getUsedCurrencies(alice.address);
        expect(aliceUsedCurrencies).to.have.lengthOf(MAX_EXPOSURE_CURRENCIES);

        // Verify ReserveFund has 5 currencies from Alice's orders
        const afterStep1ReserveFundCurrencies =
          await lendingMarketController.getUsedCurrencies(reserveFund.address);
        expect(afterStep1ReserveFundCurrencies).to.have.lengthOf(
          MAX_EXPOSURE_CURRENCIES,
        );
      });

      it('Execute order in a 6th currency to exceed MAX_EXPOSURE_CURRENCIES for ReserveFund', async () => {
        const newCurrency = additionalCurrencies[1]; // USDC3
        const depositAmount = convertToTokenAmount(
          borrowAmount.mul(2),
          newCurrency,
        );
        await depositCurrency(carol, newCurrency, depositAmount);

        const maturities = await lendingMarketController.getMaturities(
          newCurrency,
        );
        const orderAmount = convertToTokenAmount(borrowAmount, newCurrency);

        await lendingMarketController
          .connect(carol)
          .executeOrder(
            newCurrency,
            maturities[0],
            Side.BORROW,
            orderAmount,
            borrowUnitPrice,
          );

        await depositCurrency(dave, newCurrency, orderAmount);
        await lendingMarketController
          .connect(dave)
          .executeOrder(newCurrency, maturities[0], Side.LEND, orderAmount, 0);

        // Verify ReserveFund's usedCurrencies increased and exceeds MAX_EXPOSURE_CURRENCIES
        const reserveFundCurrencies =
          await lendingMarketController.getUsedCurrencies(reserveFund.address);
        expect(reserveFundCurrencies).to.have.lengthOf(6);
        expect(reserveFundCurrencies.length).to.be.greaterThan(
          MAX_EXPOSURE_CURRENCIES,
        );
      });
    });
  });
});
