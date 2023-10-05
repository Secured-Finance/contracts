import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import {
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

  let genesisDate: number;
  let maturities: BigNumber[];

  const initializeContracts = async () => {
    signers = await ethers.getSigners();

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      wETHToken,
      usdcToken,
      orderActionLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexUSDC, usdcToken.address, false);

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
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

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexWFIL);
  });

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

          if (i != 0) {
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
});
