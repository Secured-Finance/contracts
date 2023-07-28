import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PCT_DIGIT,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Order Estimations', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;

  let genesisDate: number;
  let ethMaturities: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('1000000000000000000');

  const getUsers = async (count: number) => signers.get(count);

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({ genesisDate, tokenVault, lendingMarketController, wETHToken } =
      await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexETH, genesisDate);
    }
  });

  describe('Estimate a borrowing order result', async () => {
    const orderAmount = initialETHBalance.div(5);
    const depositAmount = orderAmount.mul(3).div(2);

    before(async () => {
      [alice, bob] = await getUsers(2);
      ethMaturities = await lendingMarketController.getMaturities(hexETH);
    });

    after(async () => {
      const { activeOrders } = await lendingMarketController.getOrders(
        [hexETH],
        bob.address,
      );

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
          '8000',
          { value: orderAmount.mul(2) },
        );
    });

    it('Estimate a borrowing order result', async () => {
      const estimation = await lendingMarketController
        .connect(alice)
        .getOrderEstimation(
          hexETH,
          ethMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
          '0',
          false,
        );

      const estimation2 = await lendingMarketController
        .connect(alice)
        .getOrderEstimation(
          hexETH,
          ethMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
          '0',
          true,
        );

      await lendingMarketController
        .connect(alice)
        .executeOrder(
          hexETH,
          ethMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
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

  describe('Estimate a lending order result', async () => {
    const orderAmount = initialETHBalance.div(5);
    const depositAmount = orderAmount.mul(3).div(2);

    before(async () => {
      [alice, bob] = await getUsers(2);
      ethMaturities = await lendingMarketController.getMaturities(hexETH);
    });

    after(async () => {
      const { activeOrders } = await lendingMarketController.getOrders(
        [hexETH],
        bob.address,
      );

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
          '8000',
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
        .getOrderEstimation(
          hexETH,
          ethMaturities[0],
          Side.LEND,
          orderAmount,
          '8000',
          '0',
          false,
        );

      const estimation2 = await lendingMarketController
        .connect(alice)
        .getOrderEstimation(
          hexETH,
          ethMaturities[0],
          Side.LEND,
          orderAmount.mul(2),
          '8000',
          '0',
          false,
        );

      await lendingMarketController
        .connect(alice)
        .executeOrder(hexETH, ethMaturities[0], Side.LEND, orderAmount, '8000');

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
});
