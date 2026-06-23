import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';

describe('Performance Test: Order Book', async () => {
  let signers: SignerWithAddress[];
  let signerIdx = 1;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;

  let orderActionLogic: Contract;
  let fundManagementLogic: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  const getAllUnitPrices = async (
    lendingMarket: Contract,
    currencyKey: string,
    maturity: BigNumber,
    side: number,
  ): Promise<number[]> => {
    const orderBookId = await lendingMarketController.getOrderBookId(
      currencyKey,
      maturity,
    );

    let allUnitPrices: number[] = [];
    let start = 0;
    const limit = 1000; // Fetch 1000 at a time to avoid gas issues

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { unitPrices, next } = await lendingMarket[
        side === Side.BORROW ? 'getLendOrderBook' : 'getBorrowOrderBook'
      ](orderBookId, start, limit);

      allUnitPrices = allUnitPrices.concat(
        unitPrices
          .map((up: BigNumber) => up.toNumber())
          .filter((up: number) => up !== 0),
      );

      if (next.isZero()) {
        break;
      }
      start = next.toNumber();
    }

    return allUnitPrices;
  };

  const initializeContracts = async () => {
    signers = await ethers.getSigners();

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      wETHToken,
      usdcToken,
      orderActionLogic,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      FULL_LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);

    // Deploy Lending Markets
    const preOpeningDate = genesisDate - 604800;
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createOrderBook(hexWFIL, genesisDate, preOpeningDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createOrderBook(hexETH, genesisDate, preOpeningDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createOrderBook(hexUSDC, genesisDate, preOpeningDate)
        .then((tx) => tx.wait());
    }
  };

  describe('Fill orders without the order cleaning', async () => {
    const currencies = [
      {
        key: hexETH,
        name: 'ETH',
        orderAmount: BigNumber.from('500000000000000000'),
      },
      {
        key: hexUSDC,
        name: 'USDC',
        orderAmount: BigNumber.from('500000'),
      },
    ];
    const tests = [1, 10, 100];
    const log = {};

    before(async () => {
      await initializeContracts();
      maturities = await lendingMarketController.getMaturities(hexWFIL);
    });

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;
      let lendingMarket: Contract;

      describe(`${name} market`, async () => {
        before('Set lending markets', async () => {
          lendingMarket = await lendingMarketController
            .getLendingMarket(currencyKey)
            .then((address) => ethers.getContractAt('LendingMarket', address));

          orderActionLogic = orderActionLogic.attach(lendingMarket.address);
        });

        for (const test of tests) {
          it(`${test} orders`, async () => {
            switch (currencyKey) {
              case hexETH:
                contract = wETHToken;
                break;
              case hexUSDC:
                contract = usdcToken;
                break;
            }

            let totalAmount = BigNumber.from(0);
            let user: Wallet = Wallet.createRandom();
            let unitPrice = '0';

            process.stdout.write('        Ordered: 0');

            for (let i = 0; i < test; i++) {
              process.stdout.write('\r\x1b[K');
              process.stdout.write(`        Ordered: ${i}/${test}`);

              unitPrice = String(8000 - i);

              if (i % 5 === 0) {
                user = waffle.provider.createEmptyWallet();

                const balance = await signers[signerIdx].getBalance();
                if (balance.lt(orderAmount.mul(10))) {
                  signerIdx++;
                }

                await signers[signerIdx]
                  .sendTransaction({
                    to: user.address,
                    value:
                      currencyKey === hexETH
                        ? orderAmount.mul(15)
                        : BigNumber.from('500000000000000000'),
                  })
                  .then((tx) => tx.wait());

                if (currencyKey === hexETH) {
                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, orderAmount.mul(5), {
                      value: orderAmount.mul(5),
                    })
                    .then((tx) => tx.wait());
                } else {
                  await contract
                    .connect(signers[0])
                    .transfer(user.address, orderAmount.mul(5))
                    .then((tx) => tx.wait());

                  await contract
                    .connect(user)
                    .approve(tokenVault.address, ethers.constants.MaxUint256)
                    .then((tx) => tx.wait());

                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, orderAmount.mul(5))
                    .then((tx) => tx.wait());
                }
              }

              await lendingMarketController
                .connect(user)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  unitPrice,
                )
                .then((tx) => tx.wait());

              totalAmount = totalAmount.add(orderAmount);
            }
            process.stdout.write('\r\x1b[K');

            if (currencyKey === hexETH) {
              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, totalAmount.mul(3).div(2), {
                  value: totalAmount.mul(3).div(2),
                })
                .then((tx) => tx.wait());
            } else {
              await contract
                .connect(signers[0])
                .approve(tokenVault.address, ethers.constants.MaxUint256)
                .then((tx) => tx.wait());

              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, totalAmount.mul(3).div(2))
                .then((tx) => tx.wait());
            }

            const tx = await lendingMarketController
              .connect(signers[0])
              .executeOrder(
                currencyKey,
                maturities[0],
                Side.BORROW,
                totalAmount,
                '0',
              );

            await expect(tx)
              .to.emit(orderActionLogic, 'OrderExecuted')
              .withArgs(
                signers[0].address,
                Side.BORROW,
                currencyKey,
                maturities[0],
                totalAmount,
                0,
                totalAmount,
                unitPrice,
                () => true,
                () => true,
                0,
                0,
                0,
                false,
              );

            const receipt = await tx.wait();

            const headerName = `GasCosts(${name})`;
            if (!log[test]) {
              log[test] = {};
            }
            log[test][headerName] = receipt.gasUsed.toNumber();
          });
        }
      });
    }

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });

  describe('Place an order with the order cleaning', async () => {
    const tests = [1, 2, 8];
    const log = {};
    const currencyKey = hexUSDC;
    const orderAmount = BigNumber.from('500000');

    before(async () => {
      await initializeContracts();
      maturities = await lendingMarketController.getMaturities(hexWFIL);
    });

    describe(`USDC market`, async () => {
      before('Set lending markets', async () => {
        signerIdx++;
      });

      for (const test of tests) {
        it(`${test} markets`, async () => {
          let unitPrice = '0';

          process.stdout.write('        Ordered: 0');

          await usdcToken
            .connect(signers[0])
            .approve(tokenVault.address, ethers.constants.MaxUint256)
            .then((tx) => tx.wait());

          await tokenVault
            .connect(signers[0])
            .deposit(currencyKey, orderAmount.mul(test).mul(3).div(2))
            .then((tx) => tx.wait());

          await usdcToken
            .connect(signers[0])
            .transfer(signers[signerIdx].address, orderAmount.mul(test))
            .then((tx) => tx.wait());

          await usdcToken
            .connect(signers[signerIdx])
            .approve(tokenVault.address, ethers.constants.MaxUint256)
            .then((tx) => tx.wait());

          await tokenVault
            .connect(signers[signerIdx])
            .deposit(currencyKey, orderAmount.mul(test))
            .then((tx) => tx.wait());

          for (let i = 0; i < test; i++) {
            process.stdout.write('\r\x1b[K');
            process.stdout.write(`        Ordered: ${i}/${test}`);

            unitPrice = String(8000 - i);

            await lendingMarketController
              .connect(signers[signerIdx])
              .executeOrder(
                currencyKey,
                maturities[test - 1],
                Side.LEND,
                orderAmount,
                unitPrice,
              )
              .then((tx) => tx.wait());

            await lendingMarketController
              .connect(signers[0])
              .executeOrder(
                currencyKey,
                maturities[test - 1],
                Side.BORROW,
                orderAmount,
                '0',
              );
          }
          process.stdout.write('\r\x1b[K');

          // Test for cleaning up funds
          // const tx = await lendingMarketController
          //   .connect(signers[0])
          //   .cleanUpFunds(currencyKey, signers[signerIdx].address);

          const tx = await lendingMarketController
            .connect(signers[0])
            .executeOrder(
              currencyKey,
              maturities[0],
              Side.LEND,
              orderAmount,
              unitPrice,
            );

          const receipt = await tx.wait();

          const headerName = 'GasCosts';
          if (!log[test]) {
            log[test] = {};
          }
          log[test][headerName] = receipt.gasUsed.toNumber();
        });
      }
    });

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });

  describe('Place an order with active orders', async () => {
    const log: Record<string, number>[] = [];
    const orderAmount = BigNumber.from('500000');

    before(async () => {
      await initializeContracts();
      maturities = await lendingMarketController.getMaturities(hexWFIL);
    });

    describe(`USDC market`, async () => {
      before('Set lending markets', async () => {
        signerIdx++;
      });

      it('Deposit', async () => {
        await usdcToken
          .connect(signers[0])
          .transfer(signers[signerIdx].address, orderAmount.mul(20))
          .then((tx) => tx.wait());

        await usdcToken
          .connect(signers[signerIdx])
          .approve(tokenVault.address, ethers.constants.MaxUint256)
          .then((tx) => tx.wait());

        await tokenVault
          .connect(signers[signerIdx])
          .deposit(hexUSDC, orderAmount.mul(20))
          .then((tx) => tx.wait());
      });

      for (let i = 0; i < 20; i++) {
        it(`Active orders: ${i}`, async () => {
          let unitPrice = 8000 - i - 1;

          if (i !== 0) {
            await lendingMarketController
              .connect(signers[signerIdx])
              .executeOrder(
                hexUSDC,
                maturities[0],
                Side.LEND,
                orderAmount,
                unitPrice,
              )
              .then((tx) => tx.wait());
          }

          const estimateGas = await lendingMarketController
            .connect(signers[signerIdx])
            .estimateGas.executeOrder(
              hexUSDC,
              maturities[0],
              Side.LEND,
              orderAmount,
              unitPrice - 1,
            );

          log.push({ 'GasCosts(USDC)': estimateGas.toNumber() });
        });
      }
    });

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });

  describe('Market order fill with full order book', async () => {
    const currencies = [
      {
        key: hexETH,
        name: 'ETH',
        orderAmount: BigNumber.from('20000000000000'),
      },
      {
        key: hexUSDC,
        name: 'USDC',
        orderAmount: BigNumber.from('5000'),
      },
    ];
    // Circuit breaker limit range is 500 (5%)
    // For BORROW market order (fills LEND side):
    //   - LEND side full (unitPrice 1-10000), basePrice = 10000
    //   - CB threshold: 10000 * 0.95 = 9500 (can fill down to unitPrice 9500)
    // For LEND market order (fills BORROW side):
    //   - BORROW side full (unitPrice 1-10000), basePrice = 1
    //   - CB threshold: 1 + CIRCUIT_BREAKER_MINIMUM_LEND_RANGE(700) = 701 (can fill up to unitPrice 701)
    const tests = [
      { fillCount: 1, side: Side.BORROW },
      { fillCount: 10, side: Side.BORROW },
      { fillCount: 100, side: Side.BORROW },
      { fillCount: 501, side: Side.BORROW },
      { fillCount: 502, side: Side.BORROW },
      { fillCount: 1000, side: Side.BORROW },
      { fillCount: 1, side: Side.LEND },
      { fillCount: 10, side: Side.LEND },
      { fillCount: 100, side: Side.LEND },
      { fillCount: 701, side: Side.LEND },
      { fillCount: 702, side: Side.LEND },
      { fillCount: 1000, side: Side.LEND },
    ];
    const log = {};

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;
      let lendingMarket: Contract;

      describe(`${name} market`, async () => {
        beforeEach('Initialize contracts', async () => {
          await initializeContracts();
          maturities = await lendingMarketController.getMaturities(hexWFIL);
          lendingMarket = await lendingMarketController
            .getLendingMarket(currencyKey)
            .then((address: string) =>
              ethers.getContractAt('LendingMarket', address),
            );
          orderActionLogic = orderActionLogic.attach(lendingMarket.address);
        });

        for (const { fillCount, side } of tests) {
          it(`Market order fill ${fillCount} orders on ${
            side === Side.BORROW ? 'LEND' : 'BORROW'
          } order book`, async () => {
            switch (currencyKey) {
              case hexETH:
                contract = wETHToken;
                break;
              case hexUSDC:
                contract = usdcToken;
                break;
            }

            // Set basePrice based on which side is being filled
            // For BORROW market order: LEND side is full (unitPrice 1-10000), basePrice = 10000
            // For LEND market order: BORROW side is full (unitPrice 1-10000), basePrice = 1
            const basePrice = side === Side.BORROW ? 10000 : 1;
            const setupUser = waffle.provider.createEmptyWallet();
            const depositAmount =
              side === Side.BORROW
                ? orderAmount.mul(5)
                : orderAmount.mul(50000);

            const gasFee = BigNumber.from('500000000000000000');
            await signers[signerIdx]
              .sendTransaction({
                to: setupUser.address,
                value:
                  currencyKey === hexETH ? depositAmount.add(gasFee) : gasFee,
              })
              .then((tx: any) => tx.wait());

            if (currencyKey === hexETH) {
              await tokenVault
                .connect(setupUser)
                .deposit(currencyKey, depositAmount, {
                  value: depositAmount,
                })
                .then((tx: any) => tx.wait());
            } else {
              await contract
                .connect(signers[0])
                .transfer(setupUser.address, depositAmount)
                .then((tx: any) => tx.wait());

              await contract
                .connect(setupUser)
                .approve(tokenVault.address, ethers.constants.MaxUint256)
                .then((tx: any) => tx.wait());

              await tokenVault
                .connect(setupUser)
                .deposit(currencyKey, depositAmount)
                .then((tx: any) => tx.wait());
            }

            // Execute a few trades at basePrice to establish BlockUnitPriceAverage
            for (let i = 0; i < 3; i++) {
              await lendingMarketController
                .connect(setupUser)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  String(basePrice),
                )
                .then((tx: any) => tx.wait());

              const tx = await lendingMarketController
                .connect(setupUser)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.BORROW,
                  orderAmount,
                  String(basePrice),
                );

              await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');
              await tx.wait();
            }

            // Create full order book with orders at every unit price (1-10000)
            // For market BORROW order: fill LEND side completely (unitPrice 1-10000)
            // For market LEND order: fill BORROW side completely (unitPrice 1-10000)
            const orderBookSize = 10000;
            const maxActiveOrder = 20;

            let user: Wallet = waffle.provider.createEmptyWallet();

            process.stdout.write('        Placing orders: 0');
            for (let i = 0; i < orderBookSize; i++) {
              process.stdout.write('\r\x1b[K');
              process.stdout.write(
                `        Placing orders: ${i + 1}/${orderBookSize}`,
              );

              // Create new wallet every 20 orders (max active orders per user)
              if (i % maxActiveOrder === 0) {
                user = waffle.provider.createEmptyWallet();

                const balance = await signers[signerIdx].getBalance();
                if (balance.lt(orderAmount.mul(100))) {
                  signerIdx++;
                }

                const depositAmount =
                  side === Side.BORROW
                    ? orderAmount.mul(20)
                    : orderAmount
                        .mul(30)
                        .mul(10000)
                        .div(String(10000 - (maxActiveOrder - 1 + i)));

                await signers[signerIdx]
                  .sendTransaction({
                    to: user.address,
                    value:
                      currencyKey === hexETH
                        ? depositAmount.add(gasFee)
                        : BigNumber.from(gasFee),
                  })
                  .then((tx: any) => tx.wait());

                if (currencyKey === hexETH) {
                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount, {
                      value: depositAmount,
                    })
                    .then((tx: any) => tx.wait());
                } else {
                  await contract
                    .connect(signers[0])
                    .transfer(user.address, depositAmount)
                    .then((tx: any) => tx.wait());

                  await contract
                    .connect(user)
                    .approve(tokenVault.address, ethers.constants.MaxUint256)
                    .then((tx: any) => tx.wait());

                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount)
                    .then((tx: any) => tx.wait());
                }
              }

              // Place orders at unitPrice from 1 to 10000
              const unitPrice =
                side === Side.BORROW ? String(i + 1) : String(10000 - i);

              const orderSide = side === Side.BORROW ? Side.LEND : Side.BORROW;

              await lendingMarketController
                .connect(user)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  orderSide,
                  orderAmount,
                  unitPrice,
                )
                .then((tx: any) => tx.wait());
            }
            process.stdout.write('\r\x1b[K');

            // Deposit for market order
            const totalAmount = orderAmount.mul(fillCount);
            const totalDepositAmount =
              side === Side.BORROW ? totalAmount.mul(500) : totalAmount;

            if (currencyKey === hexETH) {
              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, totalDepositAmount, {
                  value: totalDepositAmount,
                })
                .then((tx: any) => tx.wait());
            } else {
              await contract
                .connect(signers[0])
                .approve(tokenVault.address, ethers.constants.MaxUint256)
                .then((tx: any) => tx.wait());

              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, totalDepositAmount)
                .then((tx: any) => tx.wait());
            }

            // Execute market order (unitPrice = 0)
            const tx = await lendingMarketController
              .connect(signers[0])
              .executeOrder(currencyKey, maturities[0], side, totalAmount, '0');

            const filledAmount =
              side === Side.BORROW && fillCount > 501
                ? orderAmount.mul(501)
                : side === Side.LEND && fillCount > 701
                ? orderAmount.mul(701)
                : totalAmount;
            const isCircuitBreakerTriggered = !filledAmount.eq(totalAmount);

            await expect(tx)
              .to.emit(orderActionLogic, 'OrderExecuted')
              .withArgs(
                signers[0].address,
                side,
                currencyKey,
                maturities[0],
                totalAmount,
                0,
                filledAmount,
                () => true,
                () => true,
                () => true,
                0,
                0,
                0,
                isCircuitBreakerTriggered,
              );

            const receipt = await tx.wait();

            const rowName = `${name}-${
              side === Side.BORROW ? 'BORROW' : 'LEND'
            }`;
            const suffix = isCircuitBreakerTriggered ? '-CB' : '';
            const columnName = `GasCost(${fillCount + suffix})`;
            if (!log[rowName]) {
              log[rowName] = {};
            }
            log[rowName][columnName] = receipt.gasUsed.toNumber();

            // Verify that the correct number of orders were filled
            const allUnitPrices = await getAllUnitPrices(
              lendingMarket,
              currencyKey,
              maturities[0],
              side,
            );

            // Expected: orderBookSize - filledCount active unitPrices remaining
            const filledCount = filledAmount.div(orderAmount).toNumber();
            const expectedCount = orderBookSize - filledCount;
            expect(allUnitPrices.length).to.equal(
              expectedCount,
              `Expected ${expectedCount} active unitPrices, but got ${allUnitPrices.length}`,
            );

            // Verify which unitPrices were filled
            if (side === Side.BORROW) {
              // BORROW market order fills LEND side from highest prices (10000, 9999, ...)
              // So the filled prices should be 10000 down to (10000 - filledCount + 1)
              const highestPrice = allUnitPrices.sort((a, b) => b - a).shift();

              expect(highestPrice).to.equal(
                orderBookSize - filledCount,
                `Highest remaining price should be ${
                  orderBookSize - filledCount
                }`,
              );
            } else {
              // LEND market order fills BORROW side from lowest prices (1, 2, 3, ...)
              // So the filled prices should be 1 up to filledCount
              const lowestPrice = allUnitPrices.sort((a, b) => a - b).shift();

              expect(lowestPrice).to.equal(
                10000 - orderBookSize + filledCount + 1,
                `Lowest remaining price should be ${
                  10000 - orderBookSize + filledCount + 1
                }`,
              );
            }
          });
        }
      });
    }

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });
});
