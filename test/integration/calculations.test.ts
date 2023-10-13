import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import {
  HAIRCUT,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PCT_DIGIT,
} from '../common/constants';
import { wFilToETHRate } from '../common/currencies';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Calculations', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarketReader: Contract;
  let wETHToken: Contract;

  let genesisDate: number;
  let ethMaturities: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('1000000000000000000');

  const getUsers = async (count: number) => signers.get(count);

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      currencyController,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      wETHToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexETH,
        genesisDate,
        genesisDate,
      );
    }
  });

  describe('Order Estimations', async () => {
    describe('Estimate a borrowing order result to be filled', async () => {
      const orderAmount = initialETHBalance.div(5);
      const depositAmount = orderAmount.mul(3).div(2);

      before(async () => {
        [alice, bob] = await getUsers(2);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
      });

      after(async () => {
        const { activeOrders } = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexETH, bob.address);

        for (const order of activeOrders) {
          await lendingMarketController
            .connect(bob)
            .cancelOrder(hexETH, order.maturity, order.orderId);
        }
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Place a lending order on the ETH market', async () => {
        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount.mul(2),
            '9600',
            { value: orderAmount.mul(2) },
          );
      });

      it('Estimate a borrowing order result', async () => {
        const estimation = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.BORROW,
            amount: orderAmount,
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: false,
          });

        const estimation2 = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.BORROW,
            amount: orderAmount,
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: true,
          });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '9600',
          );

        const { futureValue: aliceFV, presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            ethMaturities[0],
            alice.address,
          );

        const aliceCoverage = await tokenVault.getCoverage(alice.address);

        expect(estimation.filledAmount).to.equal(orderAmount);
        expect(
          aliceFV
            .mul(PCT_DIGIT)
            .div(estimation.filledAmountInFV.add(estimation.orderFeeInFV))
            .abs(),
        ).gte(BigNumber.from(PCT_DIGIT).sub(1));
        expect(estimation.coverage).to.equal(aliceCoverage);
        expect(estimation.coverage).to.equal(
          alicePV.abs().mul(PCT_DIGIT).div(depositAmount.add(orderAmount)),
        );
        expect(estimation2.coverage).to.equal(
          alicePV.abs().mul(PCT_DIGIT).div(depositAmount),
        );
      });
    });

    describe('Estimate a lending order result to be filled', async () => {
      const orderAmount = initialETHBalance.div(5);
      const depositAmount = orderAmount.mul(3).div(2);

      before(async () => {
        [alice, bob] = await getUsers(2);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
      });

      after(async () => {
        const { activeOrders } = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexETH, bob.address);

        for (const order of activeOrders) {
          await lendingMarketController
            .connect(bob)
            .cancelOrder(hexETH, order.maturity, order.orderId);
        }
      });

      it('Place a borrowing order on the ETH market', async () => {
        await tokenVault.connect(bob).deposit(hexETH, depositAmount.mul(2), {
          value: depositAmount.mul(2),
        });

        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount.mul(2),
            '9600',
          );
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Estimate a lending order result', async () => {
        const estimation = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.LEND,
            amount: orderAmount,
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: false,
          });

        const estimation2 = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.LEND,
            amount: orderAmount.mul(2),
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: false,
          });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '9600',
          );

        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexETH,
            ethMaturities[0],
            alice.address,
          );

        const aliceCoverage = await tokenVault.getCoverage(alice.address);

        expect(estimation.filledAmount).to.equal(orderAmount);
        expect(
          aliceFV
            .mul(PCT_DIGIT)
            .div(estimation.filledAmountInFV.sub(estimation.orderFeeInFV))
            .abs(),
        ).gte(BigNumber.from(PCT_DIGIT).sub(1));
        expect(estimation.coverage).to.equal('0');
        expect(estimation.isInsufficientDepositAmount).to.equal(false);
        expect(orderAmount).to.equal(estimation.filledAmount);
        expect(estimation.coverage).to.equal(aliceCoverage);

        expect(estimation2.filledAmount).to.equal(orderAmount.mul(2));
        expect(estimation2.isInsufficientDepositAmount).to.equal(true);
      });
    });

    describe('Estimate a borrowing order result to be placed', async () => {
      const orderAmount = initialETHBalance.div(5);
      const depositAmount = orderAmount.mul(3).div(2);

      before(async () => {
        [alice] = await getUsers(1);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
      });

      after(async () => {
        const { activeOrders } = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexETH, alice.address);

        for (const order of activeOrders) {
          await lendingMarketController
            .connect(alice)
            .cancelOrder(hexETH, order.maturity, order.orderId);
        }
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Estimate a borrowing order result', async () => {
        const estimation = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.BORROW,
            amount: orderAmount,
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: false,
          });

        const estimation2 = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.BORROW,
            amount: orderAmount,
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: true,
          });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '9600',
          );

        const aliceCoverage = await tokenVault.getCoverage(alice.address);

        expect(estimation.filledAmount).to.equal(0);
        expect(estimation.placedAmount).to.equal(orderAmount);
        expect(estimation.coverage).to.equal(aliceCoverage);
        expect(estimation.coverage).to.equal(
          orderAmount.abs().mul(PCT_DIGIT).div(depositAmount),
        );
        expect(estimation.coverage).to.equal(estimation2.coverage);
      });
    });

    describe('Estimate a lending order result to be placed', async () => {
      const orderAmount = initialETHBalance.div(5);
      const depositAmount = orderAmount.mul(3).div(2);

      before(async () => {
        [alice] = await getUsers(1);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
      });

      after(async () => {
        const { activeOrders } = await lendingMarketReader[
          'getOrders(bytes32,address)'
        ](hexETH, alice.address);

        for (const order of activeOrders) {
          await lendingMarketController
            .connect(alice)
            .cancelOrder(hexETH, order.maturity, order.orderId);
        }
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Estimate a lending order result', async () => {
        const estimation = await lendingMarketController
          .connect(alice)
          .getOrderEstimation({
            ccy: hexETH,
            maturity: ethMaturities[0],
            user: alice.address,
            side: Side.LEND,
            amount: orderAmount,
            unitPrice: '9600',
            additionalDepositAmount: '0',
            ignoreBorrowedAmount: false,
          });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '9600',
          );

        const aliceCoverage = await tokenVault.getCoverage(alice.address);

        expect(estimation.filledAmount).to.equal(0);
        expect(estimation.filledAmountInFV).to.equal(0);
        expect(estimation.coverage).to.equal('0');
        expect(estimation.isInsufficientDepositAmount).to.equal(false);
        expect(estimation.filledAmount).to.equal(0);
        expect(estimation.placedAmount).to.equal(orderAmount);
        expect(estimation.coverage).to.equal(aliceCoverage);
      });
    });
  });

  describe('Borrowable Amount Calculations', async () => {
    describe('Calculate the borrowable amount with deposit', async () => {
      const depositAmount = initialETHBalance.div(5);

      before(async () => {
        [alice] = await getUsers(1);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Calculate the borrowable amount in ETH', async () => {
        const amount = await tokenVault.getBorrowableAmount(
          alice.address,
          hexETH,
        );

        expect(amount).to.equal(depositAmount.mul(HAIRCUT).div(PCT_DIGIT));
      });

      it('Calculate the borrowable amount in WFIL', async () => {
        const amount = await tokenVault.getBorrowableAmount(
          alice.address,
          hexWFIL,
        );

        const amountInETH = amount
          .mul(wFilToETHRate)
          .div(BigNumber.from(10).pow(18));

        expect(
          amountInETH.sub(depositAmount.mul(HAIRCUT).div(PCT_DIGIT)).abs(),
        ).lte(1);
      });
    });

    for (const haircut of [0, 5000, 9600]) {
      describe(`Calculate the borrowable amount with borrowing position (Haircut: ${haircut})`, async () => {
        const depositAmount = initialETHBalance.div(5);
        const orderAmount = depositAmount.div(2);
        const orderAmount2 = orderAmount
          .mul(PCT_DIGIT)
          .div(LIQUIDATION_THRESHOLD_RATE)
          .div(2);

        before(async () => {
          [alice, bob] = await getUsers(2);
          ethMaturities = await lendingMarketController.getMaturities(hexETH);
          await currencyController.updateHaircut(hexETH, haircut);
        });

        after(async () => {
          await currencyController.updateHaircut(hexETH, HAIRCUT);
        });

        it('Deposit ETH', async () => {
          await tokenVault.connect(bob).deposit(hexETH, depositAmount, {
            value: depositAmount,
          });

          const bobDepositAmount = await tokenVault.getDepositAmount(
            bob.address,
            hexETH,
          );

          expect(bobDepositAmount).to.equal(depositAmount);
        });

        it('Fill an order to get a borrowing position', async () => {
          await lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              ethMaturities[0],
              Side.LEND,
              orderAmount,
              '9600',
              { value: orderAmount },
            );

          await lendingMarketController
            .connect(bob)
            .executeOrder(
              hexETH,
              ethMaturities[0],
              Side.BORROW,
              orderAmount,
              '9600',
            );
        });

        it('Calculate the borrowable amount in ETH(1)', async () => {
          const amount = await tokenVault.getBorrowableAmount(
            alice.address,
            hexETH,
          );

          expect(amount).to.equal(
            orderAmount.mul(PCT_DIGIT).div(LIQUIDATION_THRESHOLD_RATE),
          );
        });

        it('Calculate the borrowable amount in WFIL(1)', async () => {
          const amount = await tokenVault.getBorrowableAmount(
            alice.address,
            hexWFIL,
          );

          const amountInETH = amount
            .mul(wFilToETHRate)
            .div(BigNumber.from(10).pow(18));

          expect(
            amountInETH
              .sub(orderAmount.mul(haircut).div(LIQUIDATION_THRESHOLD_RATE))
              .abs(),
          ).lte(1);
        });

        it('Fill an order to partially use the borrowing position', async () => {
          await lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              ethMaturities[2],
              Side.BORROW,
              orderAmount2,
              '9600',
            );

          await lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              ethMaturities[1],
              Side.LEND,
              orderAmount2,
              '9600',
              { value: orderAmount2 },
            );
        });

        it('Calculate the borrowable amount in ETH(2)', async () => {
          const amount = await tokenVault.getBorrowableAmount(
            alice.address,
            hexETH,
          );

          expect(amount).to.equal(
            orderAmount
              .mul(PCT_DIGIT)
              .div(LIQUIDATION_THRESHOLD_RATE)
              .sub(orderAmount2),
          );
        });

        it('Calculate the borrowable amount in WFIL(2)', async () => {
          const amount = await tokenVault.getBorrowableAmount(
            alice.address,
            hexWFIL,
          );

          const amountInETH = amount
            .mul(wFilToETHRate)
            .div(BigNumber.from(10).pow(18));

          expect(
            amountInETH
              .sub(
                orderAmount
                  .mul(PCT_DIGIT)
                  .div(LIQUIDATION_THRESHOLD_RATE)
                  .sub(orderAmount2)
                  .mul(haircut)
                  .div(PCT_DIGIT),
              )
              .abs(),
          ).lte(1);
        });

        it('Fill an order to use the whole borrowing position', async () => {
          await lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              ethMaturities[2],
              Side.BORROW,
              orderAmount2,
              '9600',
            );

          await lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              ethMaturities[1],
              Side.LEND,
              orderAmount2,
              '9600',
              { value: orderAmount2 },
            );
        });

        it('Calculate the borrowable amount in ETH(3)', async () => {
          const amount = await tokenVault.getBorrowableAmount(
            alice.address,
            hexETH,
          );

          expect(amount).to.equal(0);
        });

        it('Calculate the borrowable amount in WFIL(3)', async () => {
          const amount = await tokenVault.getBorrowableAmount(
            alice.address,
            hexWFIL,
          );

          const amountInETH = amount
            .mul(wFilToETHRate)
            .div(BigNumber.from(10).pow(18));

          expect(amountInETH).to.equal(0);
        });
      });
    }

    describe('Calculate the borrowable amount with deposit & borrowing position', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount.div(2);

      before(async () => {
        [alice, bob] = await getUsers(2);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order to get a borrowing position', async () => {
        await lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '9600',
            { value: orderAmount },
          );

        await tokenVault.connect(bob).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '9600',
          );
      });

      it('Calculate the borrowable amount in ETH', async () => {
        const amount = await tokenVault.getBorrowableAmount(
          alice.address,
          hexETH,
        );

        expect(amount).to.equal(
          orderAmount
            .mul(PCT_DIGIT)
            .div(LIQUIDATION_THRESHOLD_RATE)
            .add(depositAmount.mul(HAIRCUT).div(PCT_DIGIT)),
        );
      });

      it('Calculate the borrowable amount in WFIL', async () => {
        const amount = await tokenVault.getBorrowableAmount(
          alice.address,
          hexWFIL,
        );

        const amountInETH = amount
          .mul(wFilToETHRate)
          .div(BigNumber.from(10).pow(18));

        expect(
          amountInETH
            .sub(
              orderAmount
                .mul(HAIRCUT)
                .div(LIQUIDATION_THRESHOLD_RATE)
                .add(depositAmount.mul(HAIRCUT).div(PCT_DIGIT)),
            )
            .abs(),
        ).lte(1);
      });
    });
  });
});
