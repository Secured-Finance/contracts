import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

import { Side } from '../../utils/constants';
import {
  hexETH,
  hexUSDC,
  hexWBTC,
  hexWFIL,
  toBytes32,
} from '../../utils/strings';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  FULL_LIQUIDATION_THRESHOLD_RATE,
  HAIRCUT,
  INITIAL_COMPOUND_FACTOR,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';

describe('Performance Test: Used Currencies Limit', async () => {
  let signers: SignerWithAddress[];
  let signerIdx = 1;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarketReader: Contract;
  let currencyController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;
  let wBTCToken: Contract;
  let wFILToken: Contract;
  let usdcToUSDPriceFeed: Contract;

  let genesisDate: number;
  let maturities: Record<string, BigNumber[]> = {};

  // Base currencies registered by deployContracts()
  const baseCurrencies = [
    {
      key: hexWFIL,
      name: 'WFIL',
      orderAmount: BigNumber.from('1000000000000000000'),
    },
    {
      key: hexETH,
      name: 'ETH',
      orderAmount: BigNumber.from('500000000000000000'),
    },
    { key: hexUSDC, name: 'USDC', orderAmount: BigNumber.from('500000') },
    { key: hexWBTC, name: 'WBTC', orderAmount: BigNumber.from('10000000') },
  ];

  // Dynamic currency configurations - will be populated based on test requirements
  let allCurrencies: Array<{
    key: string;
    name: string;
    orderAmount: BigNumber;
    token?: Contract;
  }> = [];

  // Store additional tokens created dynamically
  const additionalTokens: Record<string, Contract> = {};

  const initializeContracts = async (numberOfCurrencies: number) => {
    signers = await ethers.getSigners();

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      currencyController,
      wETHToken,
      usdcToken,
      wBTCToken,
      wFILToken,
      usdcToUSDPriceFeed,
    } = await deployContracts());

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      FULL_LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    // Initialize allCurrencies with base currencies
    allCurrencies = [...baseCurrencies];

    // Add additional currencies if needed (beyond the 4 base currencies)
    if (numberOfCurrencies > baseCurrencies.length) {
      const MockUSDC = await ethers.getContractFactory('MockUSDC');
      const usdcDecimals = await usdcToken.decimals();

      for (let i = baseCurrencies.length; i < numberOfCurrencies; i++) {
        const currencyName = `USDC${i + 1}`;
        const currencyKey = toBytes32(currencyName);

        // Deploy MockUSDC token
        const initialSupply = BigNumber.from('1000000000000000'); // Large initial supply
        const tokenContract = await MockUSDC.deploy(initialSupply);
        additionalTokens[currencyName] = tokenContract;

        // Register currency in CurrencyController (use same price feed as USDC)
        await currencyController.addCurrency(
          currencyKey,
          usdcDecimals,
          HAIRCUT,
          [usdcToUSDPriceFeed.address],
          [86400], // 24 hour heartbeat (same as USDC)
        );

        // Register currency in TokenVault
        await tokenVault.registerCurrency(
          currencyKey,
          tokenContract.address,
          false,
        );

        // Enable currency in TokenVault
        await tokenVault.updateCurrency(currencyKey, true);

        // Initialize lending market
        await lendingMarketController.initializeLendingMarket(
          currencyKey,
          genesisDate,
          INITIAL_COMPOUND_FACTOR,
          ORDER_FEE_RATE,
          CIRCUIT_BREAKER_LIMIT_RANGE,
          MIN_DEBT_UNIT_PRICE,
        );

        // Add to allCurrencies array
        allCurrencies.push({
          key: currencyKey,
          name: currencyName,
          orderAmount: BigNumber.from('500000'), // Same as USDC
          token: tokenContract,
        });
      }
    }

    // Enable only the required number of currencies
    const selectedCurrencies = allCurrencies.slice(0, numberOfCurrencies);
    for (const currency of selectedCurrencies) {
      await tokenVault.updateCurrency(currency.key, true);
    }

    // Deploy Lending Markets - Create 8 order books for each currency
    const preOpeningDate = genesisDate - 604800;
    for (const currency of selectedCurrencies) {
      for (let i = 0; i < 8; i++) {
        await lendingMarketController
          .createOrderBook(currency.key, genesisDate, preOpeningDate)
          .then((tx) => tx.wait());
      }

      // Store maturities for each currency
      maturities[currency.name] = await lendingMarketController.getMaturities(
        currency.key,
      );
    }
  };

  const getTokenContract = (currencyKey: string): Contract => {
    switch (currencyKey) {
      case hexETH:
        return wETHToken;
      case hexUSDC:
        return usdcToken;
      case hexWBTC:
        return wBTCToken;
      case hexWFIL:
        return wFILToken;
      default: {
        // Look for dynamically added currencies
        const currency = allCurrencies.find((c) => c.key === currencyKey);
        if (currency?.token) {
          return currency.token;
        }
        throw new Error(`Unknown currency: ${currencyKey}`);
      }
    }
  };

  const sendETH = async (
    currencyKey: string,
    to: string,
    amount: BigNumber,
  ) => {
    const balance = await signers[signerIdx].getBalance();
    const gasBuffer = ethers.utils.parseEther('0.2');
    const sendAmount =
      currencyKey === hexETH ? amount.add(gasBuffer) : gasBuffer;

    if (balance.lt(sendAmount)) {
      signerIdx++;
    }

    await signers[signerIdx]
      .sendTransaction({
        to: to,
        value: sendAmount,
      })
      .then((tx) => tx.wait());
  };

  const depositForUser = async (
    user: Wallet | SignerWithAddress,
    currencyKey: string,
    amount: BigNumber,
  ) => {
    const contract = getTokenContract(currencyKey);

    await sendETH(currencyKey, user.address, amount);

    if (currencyKey === hexETH) {
      await tokenVault
        .connect(user)
        .deposit(currencyKey, amount, {
          value: amount,
        })
        .then((tx) => tx.wait());
    } else {
      await contract
        .connect(signers[0])
        .transfer(user.address, amount)
        .then((tx) => tx.wait());

      await contract
        .connect(user)
        .approve(tokenVault.address, ethers.constants.MaxUint256)
        .then((tx) => tx.wait());

      await tokenVault
        .connect(user)
        .deposit(currencyKey, amount)
        .then((tx) => tx.wait());
    }
  };

  describe('LendingMarketController: Unwind Position Gas Costs with Multiple Used Currencies', async () => {
    // Test patterns: Can test any number of currencies
    // First 4 currencies use base currencies (WFIL, ETH, USDC, WBTC)
    // Additional currencies are dynamically created as USDC-based tokens (USDC5, USDC6, ...)
    const tests = [1, 2, 5];
    const log = {};

    for (const numberOfCurrencies of tests) {
      describe(`${numberOfCurrencies} currencies`, async () => {
        const ordersPerCurrency = 20; // Total LEND + BORROW orders per currency
        const orderBooksPerCurrency = 8;
        const baseOrdersPerBook = 2; // 1 LEND + 1 BORROW per order book
        const additionalOrders =
          ordersPerCurrency - baseOrdersPerBook * orderBooksPerCurrency; // 20 - 16 = 4
        // const preExistingOrdersPerBook = 100;
        const preExistingOrdersPerBook = 10;

        // Store order user to use in gas estimation
        let orderUser: Wallet;

        before(async () => {
          await initializeContracts(numberOfCurrencies);
        });

        it(`Setup: Create ${preExistingOrdersPerBook} pre-existing orders per order book`, async () => {
          const selectedCurrencies = allCurrencies.slice(0, numberOfCurrencies);

          for (const {
            key: currencyKey,
            name,
            orderAmount,
          } of selectedCurrencies) {
            const currencyMaturities = maturities[name];

            for (
              let maturityIdx = 0;
              maturityIdx < currencyMaturities.length;
              maturityIdx++
            ) {
              const maturity = currencyMaturities[maturityIdx];

              process.stdout.write(
                `\r        Creating pre-existing orders for ${name} maturity ${
                  maturityIdx + 1
                }/${currencyMaturities.length}: 0/${
                  preExistingOrdersPerBook * 2
                }`,
              );

              for (let i = 0; i < preExistingOrdersPerBook; i++) {
                process.stdout.write('\r\x1b[K');
                process.stdout.write(
                  `        Creating pre-existing orders for ${name} maturity ${
                    maturityIdx + 1
                  }/${currencyMaturities.length}: ${(i + 1) * 2}/${
                    preExistingOrdersPerBook * 2
                  }`,
                );

                const user = waffle.provider.createEmptyWallet();

                // Deposit and create order
                await depositForUser(user, currencyKey, orderAmount.mul(3));
                let nonce = await user.getTransactionCount();
                const txs = await Promise.all([
                  lendingMarketController
                    .connect(user)
                    .executeOrder(
                      currencyKey,
                      maturity,
                      Side.LEND,
                      orderAmount,
                      String(9300 - i),
                      { nonce },
                    ),
                  lendingMarketController
                    .connect(user)
                    .executeOrder(
                      currencyKey,
                      maturity,
                      Side.BORROW,
                      orderAmount,
                      String(9600 + i),
                      { nonce: nonce + 1 },
                    ),
                ]);

                await Promise.all(txs.map((tx) => tx.wait()));
              }
              process.stdout.write('\r\x1b[K');
            }
          }
        });

        it(`Setup: Place ${ordersPerCurrency} orders per currency across all order books`, async () => {
          const selectedCurrencies = allCurrencies.slice(0, numberOfCurrencies);
          const user = waffle.provider.createEmptyWallet();
          orderUser = user; // Store for later matching and gas estimation

          for (const {
            key: currencyKey,
            name,
            orderAmount,
          } of selectedCurrencies) {
            const currencyMaturities = maturities[name];

            // Deposit enough for all orders
            await depositForUser(
              user,
              currencyKey,
              orderAmount.mul(ordersPerCurrency).mul(2),
            );

            let orderCount = 0;

            // Place 1 LEND and 1 BORROW order on each of the 8 order books
            // Use unit prices that won't match
            for (
              let maturityIdx = 0;
              maturityIdx < currencyMaturities.length;
              maturityIdx++
            ) {
              const maturity = currencyMaturities[maturityIdx];
              let nonce = await user.getTransactionCount();

              const txs = await Promise.all([
                lendingMarketController
                  .connect(user)
                  .executeOrder(
                    currencyKey,
                    maturity,
                    Side.LEND,
                    orderAmount,
                    String(9400),
                    { nonce },
                  ),
                lendingMarketController
                  .connect(user)
                  .executeOrder(
                    currencyKey,
                    maturity,
                    Side.BORROW,
                    orderAmount,
                    String(9500),
                    { nonce: nonce + 1 },
                  ),
              ]);

              await Promise.all(txs.map((tx) => tx.wait()));

              orderCount += 2;
              process.stdout.write('\r\x1b[K');
              process.stdout.write(
                `        Placed orders for ${name}: ${orderCount}/${ordersPerCurrency}`,
              );
            }

            // Place additional orders on the first maturity to reach 20 total
            const firstMaturity = currencyMaturities[0];
            for (let i = 0; i < additionalOrders; i++) {
              const side = i % 2 === 0 ? Side.LEND : Side.BORROW;
              // LEND orders: 9080-9300, BORROW orders: 9680-9900
              const unitPrice =
                side === Side.LEND
                  ? String(9400 - i * 10)
                  : String(9500 + i * 10);

              await lendingMarketController
                .connect(user)
                .executeOrder(
                  currencyKey,
                  firstMaturity,
                  side,
                  orderAmount,
                  unitPrice,
                )
                .then((tx) => tx.wait());
              orderCount++;

              process.stdout.write('\r\x1b[K');
              process.stdout.write(
                `        Placed orders for ${name}: ${orderCount}/${ordersPerCurrency}`,
              );
            }

            process.stdout.write('\r\x1b[K');
          }
        });

        it(`Execute: Match orders on all maturities`, async () => {
          const selectedCurrencies = allCurrencies.slice(0, numberOfCurrencies);

          for (const {
            key: currencyKey,
            name,
            orderAmount,
          } of selectedCurrencies) {
            const currencyMaturities = maturities[name];

            // Create a separate user to match the orders
            const matchUser = waffle.provider.createEmptyWallet();

            // Deposit for BORROW matching (match half of one lend order)
            await depositForUser(
              matchUser,
              currencyKey,
              orderAmount.mul(currencyMaturities.length).mul(3).div(2),
            );

            // Execute BORROW to match half of LEND order
            // Use price >= 9000 to match LEND orders (9000-9300 range)
            for (let maturity of currencyMaturities) {
              await lendingMarketController
                .connect(matchUser)
                .executeOrder(
                  currencyKey,
                  maturity,
                  Side.BORROW,
                  orderAmount,
                  '0',
                )
                .then((tx) => tx.wait());
            }

            // Deposit for LEND matching (match half of one borrow order)
            await depositForUser(
              matchUser,
              currencyKey,
              orderAmount.mul(currencyMaturities.length),
            );

            // Execute LEND to match half of BORROW order
            // Use price <= 9600 to match BORROW orders (9600-9900 range)
            for (let maturity of currencyMaturities) {
              await lendingMarketController
                .connect(matchUser)
                .executeOrder(
                  currencyKey,
                  maturity,
                  Side.LEND,
                  orderAmount,
                  '0',
                )
                .then((tx) => tx.wait());
            }

            process.stdout.write('\r\x1b[K');
          }

          const { activeOrders, inactiveOrders } = await lendingMarketReader[
            'getOrders(bytes32[],address)'
          ](
            selectedCurrencies.map(({ key }) => key),
            orderUser.address,
          );

          console.log(
            `        Active Orders: ${activeOrders.length}, Inactive Orders: ${inactiveOrders.length}`,
          );
        });

        it(`Measure: Estimate gas costs for unwindPosition`, async () => {
          const selectedCurrencies = allCurrencies.slice(
            0,
            Math.min(numberOfCurrencies, baseCurrencies.length),
          );
          let totalGasCost = BigNumber.from(0);
          const gasCosts = {};

          for (const { key: currencyKey, name } of selectedCurrencies) {
            const currencyMaturities = maturities[name];
            const firstMaturity = currencyMaturities[0];

            // Check if position exists
            const position = await lendingMarketController.getPosition(
              currencyKey,
              firstMaturity,
              orderUser.address,
            );

            if (!position.presentValue.isZero()) {
              // Estimate gas for unwindPosition
              const estimateGas = await lendingMarketController
                .connect(orderUser)
                .estimateGas.unwindPosition(currencyKey, firstMaturity)
                .catch(() => BigNumber.from(0)); // If estimation fails, use 0

              gasCosts[`GasCosts(${name})`] = estimateGas.toNumber();
              totalGasCost = totalGasCost.add(estimateGas);
            } else {
              console.warn(
                `Warning: No position found for ${name} at maturity ${firstMaturity}`,
              );
              gasCosts[`GasCosts(${name})`] = 0;
            }
          }

          // gasCosts['TotalGasCosts'] = totalGasCost.toNumber();

          if (!log[numberOfCurrencies]) {
            log[numberOfCurrencies] = {};
          }
          Object.assign(log[numberOfCurrencies], gasCosts);
        });
      });
    }

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });

  describe('TokenVault: ExecuteOrder Gas Costs with Multiple Used Currencies', async () => {
    // Test patterns: Measure gas costs for executeOrder with different numbers of used currencies
    // This tests the TokenVault usedCurrencies limit
    const tests = [1, 2, 5, 10];
    const log = {};

    for (const numberOfCurrencies of tests) {
      describe(`${numberOfCurrencies} currencies`, async () => {
        const preExistingOrdersPerBook = 10;

        // Store deposit user (common across all currencies) for gas estimation
        let depositUser: Wallet;

        before(async () => {
          await initializeContracts(numberOfCurrencies);
        });

        it(`Setup: Create ${preExistingOrdersPerBook} pre-existing orders per order book`, async () => {
          const selectedCurrencies = allCurrencies.slice(0, numberOfCurrencies);

          for (const {
            key: currencyKey,
            name,
            orderAmount,
          } of selectedCurrencies) {
            const currencyMaturities = maturities[name];

            for (
              let maturityIdx = 0;
              maturityIdx < currencyMaturities.length;
              maturityIdx++
            ) {
              const maturity = currencyMaturities[maturityIdx];

              process.stdout.write(
                `\r        Creating pre-existing orders for ${name} maturity ${
                  maturityIdx + 1
                }/${currencyMaturities.length}: 0/${
                  preExistingOrdersPerBook * 2
                }`,
              );

              for (let i = 0; i < preExistingOrdersPerBook; i++) {
                process.stdout.write('\r\x1b[K');
                process.stdout.write(
                  `        Creating pre-existing orders for ${name} maturity ${
                    maturityIdx + 1
                  }/${currencyMaturities.length}: ${(i + 1) * 2}/${
                    preExistingOrdersPerBook * 2
                  }`,
                );

                const user = waffle.provider.createEmptyWallet();

                // Deposit and create LEND and BORROW orders
                await depositForUser(user, currencyKey, orderAmount.mul(3));
                let nonce = await user.getTransactionCount();
                const txs = await Promise.all([
                  lendingMarketController
                    .connect(user)
                    .executeOrder(
                      currencyKey,
                      maturity,
                      Side.LEND,
                      orderAmount,
                      String(9300 - i),
                      { nonce },
                    ),
                  lendingMarketController
                    .connect(user)
                    .executeOrder(
                      currencyKey,
                      maturity,
                      Side.BORROW,
                      orderAmount,
                      String(9600 + i),
                      { nonce: nonce + 1 },
                    ),
                ]);

                await Promise.all(txs.map((tx) => tx.wait()));
              }
              process.stdout.write('\r\x1b[K');
            }
          }
        });

        it(`Setup: Deposit to each currency`, async () => {
          const selectedCurrencies = allCurrencies.slice(0, numberOfCurrencies);

          // Create a single user for all currencies
          const user = waffle.provider.createEmptyWallet();
          depositUser = user; // Store for gas estimation

          for (const {
            key: currencyKey,
            name,
            orderAmount,
          } of selectedCurrencies) {
            // Deposit funds without placing orders
            await depositForUser(user, currencyKey, orderAmount.mul(20));

            process.stdout.write('\r\x1b[K');
            process.stdout.write(`        Deposited for ${name}\n`);
          }
        });

        it(`Measure: Estimate gas costs for executeOrder`, async () => {
          const selectedCurrencies = allCurrencies.slice(
            0,
            Math.min(numberOfCurrencies, baseCurrencies.length),
          );
          const gasCosts = {};

          for (const {
            key: currencyKey,
            name,
            orderAmount,
          } of selectedCurrencies) {
            const currencyMaturities = maturities[name];
            const firstMaturity = currencyMaturities[0];

            // Use the common deposit user who has deposited funds for all currencies
            const user = depositUser;

            // Estimate gas for executeOrder (LEND order)
            const estimateGas = await lendingMarketController
              .connect(user)
              .estimateGas.executeOrder(
                currencyKey,
                firstMaturity,
                Side.BORROW,
                orderAmount,
                '9500', // Price to place order
              )
              .catch(() => BigNumber.from(0)); // If estimation fails, use 0

            gasCosts[`GasCosts(${name})`] = estimateGas.toNumber();
          }

          if (!log[numberOfCurrencies]) {
            log[numberOfCurrencies] = {};
          }
          Object.assign(log[numberOfCurrencies], gasCosts);
        });
      });
    }

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });
});
