import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import { deployContracts } from '../common/deployment';

describe('Integration Test: Conservative ZC withdrawals', () => {
  for (const { bookIndex, movedPrice, perpetual } of [
    { bookIndex: 0, movedPrice: 9400, perpetual: false },
    { bookIndex: 1, movedPrice: 9800, perpetual: false },
    { bookIndex: 0, movedPrice: 9400, perpetual: true },
    { bookIndex: 1, movedPrice: 9800, perpetual: true },
  ]) {
    it(`keeps coverage after withdrawing a ${
      perpetual ? 'perpetual' : 'dated'
    } token during a current-block price move in book ${bookIndex}`, async () => {
      const [owner, user, trader] = await ethers.getSigners();
      const {
        genesisDate,
        tokenVault,
        lendingMarketController: controller,
      } = await deployContracts();
      await tokenVault.updateCurrency(hexETH, true);
      for (let i = 0; i < 3; i++) {
        await controller.createOrderBook(hexETH, genesisDate, genesisDate);
      }
      let maturities = await controller.getMaturities(hexETH);
      const deposit = ethers.utils.parseEther('20');
      for (const signer of [owner, user, trader]) {
        await tokenVault
          .connect(signer)
          .deposit(hexETH, deposit, { value: deposit });
      }
      const execute = (
        signer: typeof user,
        index: number,
        side: number,
        amount: string,
        price: number,
      ) =>
        controller
          .connect(signer)
          .executeOrder(
            hexETH,
            maturities[index],
            side,
            ethers.utils.parseEther(amount),
            price,
          );
      await execute(user, 0, Side.LEND, '8', 9600);
      await execute(owner, 0, Side.BORROW, '8', 9600);
      if (perpetual) {
        await time.increaseTo(maturities[0].toString());
        await controller.rotateOrderBooks(hexETH);
        await controller.cleanUpFunds(hexETH, user.address);
        maturities = await controller.getMaturities(hexETH);
        // Establish a traded reference in the destination book after the roll.
        await execute(owner, 0, Side.LEND, '2', 9600);
        await execute(owner, 0, Side.BORROW, '2', 9600);
      }
      await execute(owner, 1, Side.LEND, '2', 9600);
      await execute(user, 1, Side.BORROW, '2', 9600);

      const maxDeposit = await tokenVault[
        'getWithdrawableCollateral(bytes32,address)'
      ](hexETH, user.address);
      await tokenVault
        .connect(user)
        .withdraw(hexETH, maxDeposit.sub(ethers.utils.parseEther('0.3')));
      await execute(owner, bookIndex, Side.BORROW, '1', movedPrice);
      const market = await ethers.getContractAt(
        'LendingMarket',
        await controller.getLendingMarket(hexETH),
      );
      const orderBookId = await controller.getOrderBookId(
        hexETH,
        maturities[bookIndex],
      );
      const overrides = { gasLimit: 4_000_000 };
      const fill = () =>
        controller
          .connect(trader)
          .executeOrder(
            hexETH,
            maturities[bookIndex],
            Side.LEND,
            ethers.utils.parseEther('1'),
            0,
            overrides,
          );
      const withdrawalMaturity = perpetual ? 0 : maturities[0];
      const quote = () =>
        controller.getWithdrawableZCTokenAmount(
          hexETH,
          withdrawalMaturity,
          user.address,
        );
      const quoteBefore = await quote();
      const snapshot = await ethers.provider.send('evm_snapshot', []);

      const mine = async (
        ...send: Array<() => Promise<ContractTransaction>>
      ) => {
        await ethers.provider.send('evm_setAutomine', [false]);
        try {
          const transactions: ContractTransaction[] = [];
          for (const submit of send) transactions.push(await submit());
          await ethers.provider.send('evm_mine', []);
          const receipts = await Promise.all(
            transactions.map((tx) => tx.wait()),
          );
          receipts.forEach((receipt) =>
            expect(receipt.blockNumber).to.equal(receipts[0].blockNumber),
          );
        } finally {
          await ethers.provider.send('evm_setAutomine', [true]);
        }
      };
      await mine(fill);
      const timestamp = (await ethers.provider.getBlock('latest')).timestamp;
      expect(await market.getLiveUnitPrice(orderBookId)).to.equal(movedPrice);
      expect(await market.getMarketUnitPrice(orderBookId)).to.equal(9600);
      const quoteAfter = await quote();
      expect(quoteAfter).to.be.gt(0);
      expect(quoteAfter).to.be.lt(quoteBefore);
      const [valuationCollateral, valuationDebt] =
        await tokenVault.getCollateralDetail(user.address, false);
      const [conservativeCollateral, conservativeDebt] =
        await tokenVault.getCollateralDetail(user.address, true);
      expect(
        await tokenVault.getTotalCollateralAmount(user.address, false),
      ).to.equal(valuationCollateral);

      expect(
        await tokenVault.getTotalCollateralAmount(user.address, true),
      ).to.equal(conservativeCollateral);
      // Higher debt also allocates more same-currency claims without a haircut.
      // Compare the coverage ratio, rather than either collateral amount in isolation.
      expect(conservativeDebt.mul(valuationCollateral)).to.be.gte(
        valuationDebt.mul(conservativeCollateral),
      );
      expect(conservativeDebt).to.be.gte(valuationDebt);

      // Replay the move and withdrawal in the same block, with the quoted conservative limit.
      expect(await ethers.provider.send('evm_revert', [snapshot])).to.equal(
        true,
      );
      await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
      await mine(fill, () =>
        controller
          .connect(user)
          .withdrawZCToken(hexETH, withdrawalMaturity, quoteAfter, overrides),
      );
      const token = await ethers.getContractAt(
        'ZCToken',
        await controller.getZCToken(hexETH, withdrawalMaturity),
      );
      expect(await token.balanceOf(user.address)).to.equal(quoteAfter);
      const threshold = await tokenVault.getLiquidationThresholdRate();
      expect(await tokenVault.getCoverage(user.address)).to.be.lte(
        BigNumber.from(10000).mul(10000).div(threshold),
      );
    });
  }
});
