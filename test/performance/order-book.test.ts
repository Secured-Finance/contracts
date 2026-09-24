import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers, network, waffle } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import {
  getAllUnitPrices,
  progressIndicator,
} from '../common/performance-helpers';

describe('Performance Test: Order Book', async () => {
  let signers: SignerWithAddress[];
  let signerIdx = 1;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;
  let lendingMarketReader: Contract;

  let orderActionLogic: Contract;
  let fundManagementLogic: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  const MAX_ORDERS_PER_USER = 20;
  const ORDER_PROGRESS_UPDATE_INTERVAL = 100;

  const getNextOrderUser = (orderCount: number) => {
    const user = signers[signerIdx++];
    if (!user) {
      throw new Error(
        `Not enough signers to place ${orderCount} orders with at most ${MAX_ORDERS_PER_USER} orders per user`,
      );
    }
    return user;
  };

  const updateOrderProgress = (
    label: string,
    completedOrderCount: number,
    totalOrderCount: number,
  ) => {
    if (
      completedOrderCount % ORDER_PROGRESS_UPDATE_INTERVAL === 0 ||
      completedOrderCount === totalOrderCount
    ) {
      progressIndicator.update(label, completedOrderCount, totalOrderCount);
    }
  };

  const initializeContracts = async () => {
    signers = await ethers.getSigners();

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
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

            progressIndicator.start('Ordered');

            for (let i = 0; i < test; i++) {
              progressIndicator.update('Ordered', i, test);

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
            progressIndicator.clear();

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

          progressIndicator.start('Ordered');

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
            progressIndicator.update('Ordered', i, test);

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
          progressIndicator.clear();

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

  describe('Execute order with many orders at same unit price', async () => {
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
    const tests = [10, 100, 101, 1000, 10000, 100000];
    const log = {};
    let snapshotId: string;

    before('Initialize contracts', async () => {
      await network.provider.send('hardhat_reset');
      await initializeContracts();
      maturities = await lendingMarketController.getMaturities(hexWFIL);
      snapshotId = await network.provider.send('evm_snapshot');
    });

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;
      let lendingMarket: Contract;

      describe(`${name} market`, async () => {
        beforeEach('Restore contracts', async () => {
          await network.provider.send('evm_revert', [snapshotId]);
          snapshotId = await network.provider.send('evm_snapshot');
          signerIdx = 1;
          lendingMarket = await lendingMarketController
            .getLendingMarket(currencyKey)
            .then((address: string) =>
              ethers.getContractAt('LendingMarket', address),
            );
          orderActionLogic = orderActionLogic.attach(lendingMarket.address);
        });

        for (const test of tests) {
          it(`${test} orders at same unit price`, async () => {
            switch (currencyKey) {
              case hexETH:
                contract = wETHToken;
                break;
              case hexUSDC:
                contract = usdcToken;
                break;
            }

            const unitPrice = '8000';
            let totalAmount = BigNumber.from(0);
            let placeOrderGasUsed = 0;

            progressIndicator.start('Placing orders');

            // Create multiple orders at the same unit price
            let user: SignerWithAddress | undefined;
            const orderFilledTopic =
              fundManagementLogic.interface.getEventTopic('OrderFilled');

            for (let i = 0; i < test; i++) {
              if (i % MAX_ORDERS_PER_USER === 0) {
                user = getNextOrderUser(test);

                const userOrderCount = Math.min(MAX_ORDERS_PER_USER, test - i);
                const depositAmount = orderAmount.mul(userOrderCount);

                if (currencyKey === hexETH) {
                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount, {
                      value: depositAmount,
                    });
                } else {
                  await contract
                    .connect(signers[0])
                    .transfer(user.address, depositAmount);

                  await contract
                    .connect(user)
                    .approve(tokenVault.address, ethers.constants.MaxUint256);

                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount);
                }
              }

              const placeTx = await lendingMarketController
                .connect(user!)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  unitPrice,
                  { gasLimit: 60_000_000 },
                );

              // Capture the gas used for the last order placement
              if (i === test - 1) {
                const placeReceipt = await placeTx.wait();
                expect(
                  placeReceipt.logs.some(
                    ({ topics }) => topics[0] === orderFilledTopic,
                  ),
                ).to.equal(false);
                placeOrderGasUsed = placeReceipt.gasUsed.toNumber();
              }

              totalAmount = totalAmount.add(orderAmount);

              const completedOrderCount = i + 1;
              updateOrderProgress('Placing orders', completedOrderCount, test);
            }
            progressIndicator.clear();

            // Execute with amount = totalAmount - orderAmount to leave at least one order
            const fillAmount = totalAmount.sub(orderAmount);

            if (currencyKey === hexETH) {
              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, fillAmount.mul(2), {
                  value: fillAmount.mul(2),
                })
                .then((tx) => tx.wait());
            } else {
              await contract
                .connect(signers[0])
                .approve(tokenVault.address, ethers.constants.MaxUint256)
                .then((tx) => tx.wait());

              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, fillAmount.mul(2))
                .then((tx) => tx.wait());
            }

            const tx = await lendingMarketController
              .connect(signers[0])
              .executeOrder(
                currencyKey,
                maturities[0],
                Side.BORROW,
                fillAmount,
                '0',
                { gasLimit: 60_000_000 },
              );

            await expect(tx)
              .to.emit(orderActionLogic, 'OrderExecuted')
              .withArgs(
                signers[0].address,
                Side.BORROW,
                currencyKey,
                maturities[0],
                fillAmount,
                0,
                fillAmount,
                unitPrice,
                () => true,
                () => true,
                0,
                0,
                0,
                false,
              );

            const receipt = await tx.wait();

            const fillRowName = `${name}-Fill`;
            const placeRowName = `${name}-Place`;
            const columnName = `GasCosts(${test})`;
            if (!log[fillRowName]) {
              log[fillRowName] = {};
            }
            if (!log[placeRowName]) {
              log[placeRowName] = {};
            }
            log[fillRowName][columnName] = receipt.gasUsed.toNumber();
            log[placeRowName][columnName] = placeOrderGasUsed;
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

  describe('Compare order creation and cancellation with different numbers of orders at same unit price', async () => {
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
    const tests = [10, 100, 1000, 10000, 100000];
    const log = {};
    let snapshotId: string;

    before('Initialize contracts', async () => {
      await network.provider.send('hardhat_reset');
      await initializeContracts();
      maturities = await lendingMarketController.getMaturities(hexWFIL);
      snapshotId = await network.provider.send('evm_snapshot');
    });

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;
      let lendingMarket: Contract;

      describe(`${name} market`, async () => {
        beforeEach('Restore contracts', async () => {
          await network.provider.send('evm_revert', [snapshotId]);
          snapshotId = await network.provider.send('evm_snapshot');
          signerIdx = 1;
          lendingMarket = await lendingMarketController
            .getLendingMarket(currencyKey)
            .then((address: string) =>
              ethers.getContractAt('LendingMarket', address),
            );
          orderActionLogic = orderActionLogic.attach(lendingMarket.address);
        });

        for (const test of tests) {
          it(`${test} orders at same unit price`, async () => {
            switch (currencyKey) {
              case hexETH:
                contract = wETHToken;
                break;
              case hexUSDC:
                contract = usdcToken;
                break;
            }

            const unitPrice = '8000';
            let totalAmount = BigNumber.from(0);
            let placeOrderGasUsed = 0;

            progressIndicator.start('Placing orders');

            // Create multiple orders at the same unit price
            let user: SignerWithAddress | undefined;
            const orderFilledTopic =
              fundManagementLogic.interface.getEventTopic('OrderFilled');

            for (let i = 0; i < test; i++) {
              if (i % MAX_ORDERS_PER_USER === 0) {
                user = getNextOrderUser(test);

                const userOrderCount = Math.min(MAX_ORDERS_PER_USER, test - i);
                const depositAmount = orderAmount.mul(userOrderCount);

                if (currencyKey === hexETH) {
                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount, {
                      value: depositAmount,
                    });
                } else {
                  await contract
                    .connect(signers[0])
                    .transfer(user.address, depositAmount);

                  await contract
                    .connect(user)
                    .approve(tokenVault.address, ethers.constants.MaxUint256);

                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount);
                }
              }

              const placeTx = await lendingMarketController
                .connect(user!)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  unitPrice,
                  { gasLimit: 60_000_000 },
                );

              // Capture the gas used for the last order placement
              if (i === test - 1) {
                const placeReceipt = await placeTx.wait();
                expect(
                  placeReceipt.logs.some(
                    ({ topics }) => topics[0] === orderFilledTopic,
                  ),
                ).to.equal(false);
                placeOrderGasUsed = placeReceipt.gasUsed.toNumber();
              }

              totalAmount = totalAmount.add(orderAmount);

              updateOrderProgress('Placing orders', i + 1, test);
            }
            progressIndicator.clear();

            const { activeOrders } = await lendingMarketReader[
              'getOrders(bytes32,address)'
            ](currencyKey, user!.address);

            const tx = await lendingMarketController
              .connect(user!)
              .cancelOrder(
                currencyKey,
                activeOrders[0].maturity,
                activeOrders[0].orderId,
              );

            const receipt = await tx.wait();

            const fillRowName = `${name}-Cancel`;
            const placeRowName = `${name}-Place`;
            const columnName = `GasCosts(${test})`;
            if (!log[fillRowName]) {
              log[fillRowName] = {};
            }
            if (!log[placeRowName]) {
              log[placeRowName] = {};
            }
            log[fillRowName][columnName] = receipt.gasUsed.toNumber();
            log[placeRowName][columnName] = placeOrderGasUsed;
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
    const tests = [1, 10, 100, 501, 502, 1000];
    const log = {};
    let snapshotId: string;

    before('Initialize contracts', async () => {
      await network.provider.send('hardhat_reset');
      await initializeContracts();
      maturities = await lendingMarketController.getMaturities(hexWFIL);
      snapshotId = await network.provider.send('evm_snapshot');
    });

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;
      let lendingMarket: Contract;

      describe(`${name} market`, async () => {
        beforeEach('Restore contracts', async () => {
          await network.provider.send('evm_revert', [snapshotId]);
          snapshotId = await network.provider.send('evm_snapshot');
          signerIdx = 1;
          lendingMarket = await lendingMarketController
            .getLendingMarket(currencyKey)
            .then((address: string) =>
              ethers.getContractAt('LendingMarket', address),
            );
          orderActionLogic = orderActionLogic.attach(lendingMarket.address);
        });

        for (const fillCount of tests) {
          it(`Market BORROW order fill ${fillCount} orders on LEND order book`, async () => {
            switch (currencyKey) {
              case hexETH:
                contract = wETHToken;
                break;
              case hexUSDC:
                contract = usdcToken;
                break;
            }

            // For BORROW market order: LEND side is full (unitPrice 1-10000), basePrice = 10000
            const basePrice = 10000;
            const setupUser = getNextOrderUser(1);
            const depositAmount = orderAmount.mul(5);

            if (currencyKey === hexETH) {
              await tokenVault
                .connect(setupUser)
                .deposit(currencyKey, depositAmount, {
                  value: depositAmount,
                });
            } else {
              await contract
                .connect(signers[0])
                .transfer(setupUser.address, depositAmount);

              await contract
                .connect(setupUser)
                .approve(tokenVault.address, ethers.constants.MaxUint256);

              await tokenVault
                .connect(setupUser)
                .deposit(currencyKey, depositAmount);
            }

            // Execute a few trades at basePrice to establish BlockUnitPriceAverage
            const orderFilledTopic =
              fundManagementLogic.interface.getEventTopic('OrderFilled');
            for (let i = 0; i < 3; i++) {
              await lendingMarketController
                .connect(setupUser)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  String(basePrice),
                );

              const tx = await lendingMarketController
                .connect(setupUser)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.BORROW,
                  orderAmount,
                  String(basePrice),
                );

              const receipt = await tx.wait();
              expect(
                receipt.logs.some(
                  ({ topics }) => topics[0] === orderFilledTopic,
                ),
              ).to.equal(true);
            }

            // Create full order book with orders at every unit price (1-10000)
            // The market BORROW order fills the LEND side (unitPrice 1-10000)
            const orderBookSize = 10000;

            let user: SignerWithAddress | undefined;

            progressIndicator.start('Placing orders');
            for (let i = 0; i < orderBookSize; i++) {
              if (i % MAX_ORDERS_PER_USER === 0) {
                user = getNextOrderUser(orderBookSize);

                const depositAmount = orderAmount.mul(MAX_ORDERS_PER_USER);

                if (currencyKey === hexETH) {
                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount, {
                      value: depositAmount,
                    });
                } else {
                  await contract
                    .connect(signers[0])
                    .transfer(user.address, depositAmount);

                  await contract
                    .connect(user)
                    .approve(tokenVault.address, ethers.constants.MaxUint256);

                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, depositAmount);
                }
              }

              // Place orders at unitPrice from 1 to 10000
              const unitPrice = String(i + 1);

              await lendingMarketController
                .connect(user!)
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  unitPrice,
                );

              updateOrderProgress('Placing orders', i + 1, orderBookSize);
            }
            progressIndicator.clear();

            // Deposit for market order
            const totalAmount = orderAmount.mul(fillCount);
            const totalDepositAmount = totalAmount.mul(500);

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
              .executeOrder(
                currencyKey,
                maturities[0],
                Side.BORROW,
                totalAmount,
                '0',
              );

            const filledAmount =
              fillCount > 501 ? orderAmount.mul(501) : totalAmount;
            const isCircuitBreakerTriggered = !filledAmount.eq(totalAmount);

            await expect(tx)
              .to.emit(orderActionLogic, 'OrderExecuted')
              .withArgs(
                signers[0].address,
                Side.BORROW,
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

            const rowName = `${name}-BORROW`;
            const suffix = isCircuitBreakerTriggered ? '-CB' : '';
            const columnName = `GasCost(${fillCount + suffix})`;
            if (!log[rowName]) {
              log[rowName] = {};
            }
            log[rowName][columnName] = receipt.gasUsed.toNumber();

            // Verify that the correct number of orders were filled
            const allUnitPrices = await getAllUnitPrices(
              lendingMarketController,
              lendingMarket,
              currencyKey,
              maturities[0],
              Side.BORROW,
            );

            // Expected: orderBookSize - filledCount active unitPrices remaining
            const filledCount = filledAmount.div(orderAmount).toNumber();
            const expectedCount = orderBookSize - filledCount;
            expect(allUnitPrices.length).to.equal(
              expectedCount,
              `Expected ${expectedCount} active unitPrices, but got ${allUnitPrices.length}`,
            );

            // Verify which unitPrices were filled
            // BORROW market order fills LEND side from highest prices (10000, 9999, ...)
            // So the filled prices should be 10000 down to (10000 - filledCount + 1)
            const highestPrice = allUnitPrices.sort((a, b) => b - a).shift();

            expect(highestPrice).to.equal(
              orderBookSize - filledCount,
              `Highest remaining price should be ${
                orderBookSize - filledCount
              }`,
            );
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
