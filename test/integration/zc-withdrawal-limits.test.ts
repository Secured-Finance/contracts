import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC } from '../../utils/strings';
import { deployContracts } from '../common/deployment';

describe('Integration Test: ZC withdrawal collateral limits', () => {
  for (const [marginInWei, expectedLimit] of [
    [600000000, 0],
    [2100000000, 2],
  ]) {
    it(`rounds the haircut-adjusted USDC limit down to ${expectedLimit} with ETH debt`, async () => {
      const [owner, user] = await ethers.getSigners();
      const {
        genesisDate,
        currencyController,
        tokenVault,
        usdcToken,
        lendingMarketController: controller,
      } = await deployContracts();

      await tokenVault.updateCurrency(hexETH, true);
      await tokenVault.updateCurrency(hexUSDC, true);
      await currencyController.updateHaircut(hexUSDC, 8000);

      for (let index = 0; index < 2; index++) {
        await controller.createOrderBook(hexUSDC, genesisDate, genesisDate);
        await controller.createOrderBook(hexETH, genesisDate, genesisDate);
      }

      const usdcMaturities = await controller.getMaturities(hexUSDC);
      const ethMaturities = await controller.getMaturities(hexETH);
      const deposit = ethers.utils.parseEther('1');
      const claimAmount = 2000002;

      for (const signer of [owner, user]) {
        await tokenVault
          .connect(signer)
          .deposit(hexETH, deposit, { value: deposit });

        if (signer.address !== owner.address) {
          await usdcToken.transfer(signer.address, claimAmount);
        }

        await usdcToken
          .connect(signer)
          .approve(tokenVault.address, ethers.constants.MaxUint256);
        await tokenVault.connect(signer).deposit(hexUSDC, claimAmount);
      }

      await controller
        .connect(user)
        .executeOrder(hexUSDC, usdcMaturities[0], Side.LEND, claimAmount, 9600);
      await controller
        .connect(owner)
        .executeOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.BORROW,
          claimAmount,
          9600,
        );

      const debtAmount = ethers.utils.parseEther('0.008');
      await controller
        .connect(owner)
        .executeOrder(hexETH, ethMaturities[1], Side.LEND, debtAmount, 9600);
      await controller
        .connect(user)
        .executeOrder(hexETH, ethMaturities[1], Side.BORROW, debtAmount, 9600);

      await tokenVault
        .connect(user)
        .withdraw(hexUSDC, ethers.constants.MaxUint256);

      const maxDeposit = await tokenVault[
        'getWithdrawableCollateral(bytes32,address)'
      ](hexETH, user.address);
      await tokenVault
        .connect(user)
        .withdraw(hexETH, maxDeposit.sub(marginInWei));

      expect((await tokenVault.isCovered(user.address, hexUSDC))[0]).to.equal(
        true,
      );

      // With 2 units of collateral headroom, 2 / 0.8 must round down to 2 PV, not 3.
      const limit = await controller.getWithdrawableZCTokenAmount(
        hexUSDC,
        usdcMaturities[0],
        user.address,
      );
      expect(limit).to.equal(expectedLimit);

      if (expectedLimit === 0) {
        await expect(
          controller
            .connect(user)
            .withdrawZCToken(
              hexUSDC,
              usdcMaturities[0],
              ethers.constants.MaxUint256,
            ),
        ).to.be.revertedWith('AmountIsZero');
      } else {
        await controller
          .connect(user)
          .withdrawZCToken(
            hexUSDC,
            usdcMaturities[0],
            ethers.constants.MaxUint256,
          );
      }

      expect((await tokenVault.isCovered(user.address, hexUSDC))[0]).to.equal(
        true,
      );
    });
  }

  for (const perpetual of [false, true]) {
    for (const [marginInWei, expectedLimit] of [
      [600000000, 0],
      [1600000000, 1],
      [13400000000, 13],
    ]) {
      it(`preserves coverage at the USDC ${expectedLimit} PV boundary for ${
        perpetual ? 'perpetual' : 'dated'
      } withdrawals`, async () => {
        const [owner, user, priceMaker] = await ethers.getSigners();
        const {
          genesisDate,
          tokenVault,
          usdcToken,
          lendingMarketController: controller,
        } = await deployContracts();

        await tokenVault.updateCurrency(hexETH, true);
        await tokenVault.updateCurrency(hexUSDC, true);

        for (let index = 0; index < 3; index++) {
          await controller.createOrderBook(hexUSDC, genesisDate, genesisDate);
        }

        let maturities = await controller.getMaturities(hexUSDC);
        const deposit = ethers.utils.parseEther('1');

        for (const signer of [owner, user]) {
          await tokenVault
            .connect(signer)
            .deposit(hexETH, deposit, { value: deposit });

          if (signer.address !== owner.address) {
            await usdcToken.transfer(signer.address, 2000000);
          }

          await usdcToken
            .connect(signer)
            .approve(tokenVault.address, ethers.constants.MaxUint256);
          await tokenVault.connect(signer).deposit(hexUSDC, 2000000);
        }

        await controller
          .connect(user)
          .executeOrder(hexUSDC, maturities[0], Side.LEND, 2000000, 9600);
        await controller
          .connect(owner)
          .executeOrder(hexUSDC, maturities[0], Side.BORROW, 2000000, 9600);

        if (perpetual) {
          await time.increaseTo(maturities[0].toString());
          await controller.rotateOrderBooks(hexUSDC);
          maturities = await controller.getMaturities(hexUSDC);

          // Establish a non-par price without changing the user's FV position.
          await usdcToken.transfer(priceMaker.address, 1000000);
          await usdcToken
            .connect(priceMaker)
            .approve(tokenVault.address, ethers.constants.MaxUint256);
          await tokenVault.connect(priceMaker).deposit(hexUSDC, 1000000);
          await controller
            .connect(priceMaker)
            .executeOrder(hexUSDC, maturities[0], Side.LEND, 1000000, 9600);
          await controller
            .connect(owner)
            .executeOrder(hexUSDC, maturities[0], Side.BORROW, 1000000, 9600);
        }

        await tokenVault.connect(owner).deposit(hexUSDC, 8000000);

        await controller
          .connect(owner)
          .executeOrder(hexUSDC, maturities[1], Side.LEND, 8000000, 9600);
        await controller
          .connect(user)
          .executeOrder(hexUSDC, maturities[1], Side.BORROW, 8000000, 9600);

        await tokenVault
          .connect(user)
          .withdraw(hexUSDC, ethers.constants.MaxUint256);

        const maxDeposit = await tokenVault[
          'getWithdrawableCollateral(bytes32,address)'
        ](hexETH, user.address);

        // Leave fractional USDC base units of headroom to exercise rounding boundaries.
        await tokenVault
          .connect(user)
          .withdraw(hexETH, maxDeposit.sub(marginInWei));

        expect((await tokenVault.isCovered(user.address, hexUSDC))[0]).to.equal(
          true,
        );

        const withdrawalMaturity = perpetual ? 0 : maturities[0];
        const limit = await controller.getWithdrawableZCTokenAmount(
          hexUSDC,
          withdrawalMaturity,
          user.address,
        );

        if (!perpetual || expectedLimit === 0) {
          expect(limit).to.equal(expectedLimit);
        } else {
          expect(limit).to.be.gt(0);
        }

        if (expectedLimit === 0) {
          await expect(
            controller
              .connect(user)
              .withdrawZCToken(
                hexUSDC,
                withdrawalMaturity,
                ethers.constants.MaxUint256,
              ),
          ).to.be.revertedWith('AmountIsZero');
        } else {
          await controller
            .connect(user)
            .withdrawZCToken(
              hexUSDC,
              withdrawalMaturity,
              ethers.constants.MaxUint256,
            );
        }

        expect((await tokenVault.isCovered(user.address, hexUSDC))[0]).to.equal(
          true,
        );
      });
    }
  }

  for (const perpetual of [false, true]) {
    for (const offsetting of [false, true]) {
      it(`limits ${perpetual ? 'perpetual' : 'dated'} withdrawals with ${
        offsetting
          ? 'opposite FV and GV'
          : 'fully allocated same-currency collateral'
      }`, async () => {
        const [owner, user] = await ethers.getSigners();
        const {
          genesisDate,
          tokenVault,
          lendingMarketController: controller,
        } = await deployContracts();
        await tokenVault.updateCurrency(hexETH, true);

        for (let index = 0; index < 3; index++) {
          await controller.createOrderBook(hexETH, genesisDate, genesisDate);
        }

        let maturities = await controller.getMaturities(hexETH);
        const deposit = ethers.utils.parseEther('20');

        for (const signer of [owner, user]) {
          await tokenVault
            .connect(signer)
            .deposit(hexETH, deposit, { value: deposit });
        }

        const execute = (
          signer: typeof user,
          index: number,
          side: number,
          amount: string,
        ) =>
          controller
            .connect(signer)
            .executeOrder(
              hexETH,
              maturities[index],
              side,
              ethers.utils.parseEther(amount),
              9600,
            );

        const initialLend = !offsetting || perpetual;
        const firstAmount = offsetting ? (perpetual ? '10' : '8') : '2';
        await execute(initialLend ? user : owner, 0, Side.LEND, firstAmount);
        await execute(initialLend ? owner : user, 0, Side.BORROW, firstAmount);

        if (perpetual || offsetting) {
          await time.increaseTo(maturities[0].toString());
          await controller.rotateOrderBooks(hexETH);
          await controller.cleanUpFunds(hexETH, user.address);
          maturities = await controller.getMaturities(hexETH);
        }

        const debtIndex = offsetting ? 0 : 1;
        const secondLend = offsetting && !perpetual;
        const secondAmount = secondLend ? '10' : '8';

        await execute(
          secondLend ? user : owner,
          debtIndex,
          Side.LEND,
          secondAmount,
        );
        await execute(
          secondLend ? owner : user,
          debtIndex,
          Side.BORROW,
          secondAmount,
        );
        await controller.cleanUpFunds(hexETH, user.address);

        const withdrawalMaturity = perpetual ? 0 : maturities[0];
        const position = await controller.getPosition(
          hexETH,
          maturities[0],
          user.address,
        );
        const genesis = await controller.getGenesisValue(hexETH, user.address);

        if (offsetting) {
          if (perpetual) {
            expect(genesis.amountInFV).to.be.gt(position.futureValue);
          } else {
            expect(genesis.amountInFV).to.be.lt(0);
          }
        }

        const maxDeposit = await tokenVault[
          'getWithdrawableCollateral(bytes32,address)'
        ](hexETH, user.address);
        const margin = offsetting
          ? BigNumber.from(0)
          : ethers.utils.parseEther('0.1');
        await tokenVault.connect(user).withdraw(hexETH, maxDeposit.sub(margin));
        const limit = await controller.getWithdrawableZCTokenAmount(
          hexETH,
          withdrawalMaturity,
          user.address,
        );
        expect(limit).to.be.gt(0);

        const component = perpetual
          ? genesis.amount
          : position.futureValue.sub(genesis.amountInFV);
        expect(limit).to.be.lt(component);

        await controller
          .connect(user)
          .withdrawZCToken(
            hexETH,
            withdrawalMaturity,
            ethers.constants.MaxUint256,
          );

        const token = await ethers.getContractAt(
          'ZCToken',
          await controller.getZCToken(hexETH, withdrawalMaturity),
        );
        expect(await token.balanceOf(user.address)).to.equal(limit);

        const [covered] = await tokenVault.isCovered(user.address, hexETH);
        expect(covered).to.equal(true);
      });
    }
  }

  it('allows an unencumbered claim to be withdrawn even with a zero haircut', async () => {
    const [owner, user] = await ethers.getSigners();
    const {
      genesisDate,
      currencyController,
      tokenVault,
      lendingMarketController: controller,
    } = await deployContracts();
    await tokenVault.updateCurrency(hexETH, true);
    await currencyController.updateHaircut(hexETH, 0);
    await controller.createOrderBook(hexETH, genesisDate, genesisDate);
    const [maturity] = await controller.getMaturities(hexETH);
    const amount = ethers.utils.parseEther('2');

    for (const signer of [owner, user]) {
      await tokenVault
        .connect(signer)
        .deposit(hexETH, amount.mul(2), { value: amount.mul(2) });
    }

    await controller
      .connect(user)
      .executeOrder(hexETH, maturity, Side.LEND, amount, 9600);
    await controller
      .connect(owner)
      .executeOrder(hexETH, maturity, Side.BORROW, amount, 9600);
    await tokenVault
      .connect(user)
      .withdraw(hexETH, ethers.constants.MaxUint256);

    const limit = await controller.getWithdrawableZCTokenAmount(
      hexETH,
      maturity,
      user.address,
    );
    expect(limit).to.equal(
      (await controller.getPosition(hexETH, maturity, user.address))
        .futureValue,
    );

    await controller.connect(user).withdrawZCToken(hexETH, maturity, limit);
    expect((await tokenVault.isCovered(user.address, hexETH))[0]).to.equal(
      true,
    );
  });
});
