import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import { deployContracts } from '../common/deployment';

describe('Performance Test: Order coverage after lazy cleanup', () => {
  for (const [maturityCount, orderCount] of [
    [1, 1],
    [8, 8],
    [8, 20],
  ]) {
    it(`Executes a filled order after cleaning ${orderCount} orders across ${maturityCount} maturities`, async () => {
      const [, lender, borrower, maker] = await ethers.getSigners();
      const { genesisDate, tokenVault, lendingMarketController } =
        await deployContracts();
      await tokenVault.updateCurrency(hexETH, true);

      for (let i = 0; i < 8; i++) {
        await lendingMarketController.createOrderBook(
          hexETH,
          genesisDate,
          genesisDate - 604800,
        );
      }
      const maturities = await lendingMarketController.getMaturities(hexETH);
      const unitPrices = await Promise.all(
        maturities.map(async (maturity) => {
          const range = await lendingMarketController.getOrderUnitPriceRange(
            hexETH,
            maturity,
          );
          return range.maxLendUnitPrice;
        }),
      );
      const amount = ethers.utils.parseEther('0.1');
      for (const user of [lender, borrower, maker]) {
        await tokenVault.connect(user).deposit(hexETH, amount.mul(100), {
          value: amount.mul(100),
        });
      }

      // Filled maker orders remain pending in each maturity until lender next acts.
      for (let i = 0; i < orderCount; i++) {
        const index = i % maturityCount;
        await lendingMarketController
          .connect(lender)
          .executeOrder(
            hexETH,
            maturities[index],
            Side.LEND,
            amount,
            unitPrices[index],
          );
      }
      for (let i = 0; i < orderCount; i++) {
        const index = i % maturityCount;
        await lendingMarketController
          .connect(borrower)
          .executeOrder(
            hexETH,
            maturities[index],
            Side.BORROW,
            amount,
            unitPrices[index],
          );
      }

      const market = await ethers.getContractAt(
        'LendingMarket',
        await lendingMarketController.getLendingMarket(hexETH),
      );
      const pendingCounts = await Promise.all(
        maturities.slice(0, maturityCount).map(async (maturity) => {
          const orderBookId = await lendingMarketController.getOrderBookId(
            hexETH,
            maturity,
          );
          const [, inactiveIds] = await market.getLendOrderIds(
            orderBookId,
            lender.address,
          );
          return inactiveIds.length;
        }),
      );
      expect(pendingCounts.reduce((sum, count) => sum + count, 0)).to.equal(
        orderCount,
      );

      await lendingMarketController
        .connect(maker)
        .executeOrder(
          hexETH,
          maturities[0],
          Side.BORROW,
          amount,
          unitPrices[0],
        );
      const receipt = await lendingMarketController
        .connect(lender)
        .executeOrder(hexETH, maturities[0], Side.LEND, amount, unitPrices[0])
        .then((tx) => tx.wait());

      console.log(
        `Order coverage: ${orderCount} pending orders across ${maturityCount} maturities, ${receipt.gasUsed.toString()} gas`,
      );
      // A regression budget for these fixtures, rather than a bound for all accounts.
      expect(receipt.gasUsed.toNumber()).to.be.lessThan(5_000_000);
      expect(
        await lendingMarketController.getUsedMaturities(hexETH, lender.address),
      ).to.have.length(maturityCount);
    });
  }
});
