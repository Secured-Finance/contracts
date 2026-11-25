import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import { LIQUIDATION_THRESHOLD_RATE, PCT_DIGIT } from '../common/constants';
import { wFilToETHRate } from '../common/currencies';
import { deployContracts } from '../common/deployment';

describe('Integration Test: Liquidation valuation price', () => {
  const amount = ethers.utils.parseEther('2000');
  const initialPrice = 9600;
  const movedPrice = 9800;
  const overrides = { gasLimit: 3_000_000, gasPrice: 10_000_000_000 };

  const setup = async () => {
    const [owner, borrower, lender, liquidator] = await ethers.getSigners();
    const {
      genesisDate,
      tokenVault,
      lendingMarketController: controller,
      liquidationLogic,
      currencyController,
      wFILToken,
      wFilToETHPriceFeed,
    } = await deployContracts();

    await tokenVault.updateCurrency(hexETH, true);
    await controller.createOrderBook(hexWFIL, genesisDate, genesisDate);

    const [maturity] = await controller.getMaturities(hexWFIL);
    const orderBookId = await controller.getOrderBookId(hexWFIL, maturity);
    const market = await ethers.getContractAt(
      'LendingMarket',
      await controller.getLendingMarket(hexWFIL),
    );

    for (const [user, value] of [
      [borrower, ethers.utils.parseEther('12')],
      [owner, ethers.utils.parseEther('40')],
      [liquidator, ethers.utils.parseEther('40')],
    ] as const) {
      await tokenVault.connect(user).deposit(hexETH, value, { value });
    }

    await wFILToken.transfer(lender.address, amount.mul(2));
    await wFILToken.connect(lender).approve(tokenVault.address, amount.mul(2));
    await tokenVault.connect(lender).deposit(hexWFIL, amount.mul(2));

    const lend = () =>
      controller
        .connect(lender)
        .executeOrder(hexWFIL, maturity, Side.LEND, amount, 0, overrides);

    const liquidate = () =>
      controller
        .connect(liquidator)
        .executeLiquidationCall(
          hexETH,
          hexWFIL,
          maturity,
          borrower.address,
          overrides,
        );

    const liquidateStatic = () =>
      controller
        .connect(liquidator)
        .callStatic.executeLiquidationCall(
          hexETH,
          hexWFIL,
          maturity,
          borrower.address,
        );

    const expectNoLiquidationAmount = async () => {
      const expected = liquidationLogic.interface.encodeErrorResult(
        'NoLiquidationAmount',
        [borrower.address, hexETH],
      );
      await liquidateStatic().then(
        () => expect.fail('Expected liquidation to revert'),
        (error) => expect(error.data).to.equal(expected),
      );
    };

    const debtFV = async () =>
      (await controller.getPosition(hexWFIL, maturity, borrower.address))
        .futureValue as BigNumber;

    const placeBorrow = async (user: typeof borrower, unitPrice: number) =>
      controller
        .connect(user)
        .executeOrder(hexWFIL, maturity, Side.BORROW, amount, unitPrice);

    const setCoveredRatio = async (ratio: number) => {
      const [collateral, debt] = await tokenVault.getCollateralDetail(
        borrower.address,
        false,
      );
      await wFilToETHPriceFeed.updateAnswer(
        wFilToETHRate.mul(collateral).mul(PCT_DIGIT).div(debt.mul(ratio)),
      );
    };

    const liquidationEvent = async (tx: ContractTransaction) => {
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        ({ topics }) =>
          topics[0] ===
          liquidationLogic.interface.getEventTopic('LiquidationExecuted'),
      );

      expect(event).not.to.equal(undefined);
      return liquidationLogic.interface.parseLog(event!).args;
    };

    return {
      owner,
      borrower,
      liquidator,
      controller,
      tokenVault,
      currencyController,
      maturity,
      liquidationLogic,
      market,
      orderBookId,
      wFilToETHPriceFeed,
      lend,
      liquidate,
      liquidateStatic,
      expectNoLiquidationAmount,
      debtFV,
      placeBorrow,
      setCoveredRatio,
      liquidationEvent,
    };
  };

  // Use equal gas prices so Hardhat mines these transactions in submission order.
  const mineTogether = async (
    ...submit: Array<() => Promise<ContractTransaction>>
  ) => {
    await ethers.provider.send('evm_setAutomine', [false]);

    try {
      const transactions: ContractTransaction[] = [];

      for (const send of submit) {
        transactions.push(await send());
      }

      await ethers.provider.send('evm_mine', []);

      const receipts = await Promise.all(
        transactions.map(({ hash }) =>
          ethers.provider.getTransactionReceipt(hash),
        ),
      );

      receipts.forEach((receipt, index) => {
        expect(receipt.blockNumber).to.equal(receipts[0].blockNumber);
        expect(receipt.transactionIndex).to.equal(index);
      });

      return { transactions, receipts };
    } finally {
      await ethers.provider.send('evm_setAutomine', [true]);
    }
  };

  it('rejects a liquidation that becomes eligible only in the next block', async () => {
    const fixture = await setup();

    await fixture.placeBorrow(fixture.borrower, initialPrice);
    await fixture.lend();
    await fixture.placeBorrow(fixture.owner, movedPrice);
    await fixture.setCoveredRatio(LIQUIDATION_THRESHOLD_RATE + 100);
    await fixture.expectNoLiquidationAmount();

    const { receipts } = await mineTogether(fixture.lend, fixture.liquidate);

    expect(receipts[0].status).to.equal(1);
    expect(receipts[1].status).to.equal(0);
    expect(await fixture.market.getLiveUnitPrice(fixture.orderBookId)).to.equal(
      movedPrice,
    );
    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(initialPrice);

    await fixture.expectNoLiquidationAmount();

    await ethers.provider.send('evm_mine', []);

    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(movedPrice);
    expect(await fixture.liquidateStatic()).to.equal(true);
  });

  it('keeps the liquidation amount and transferred FV unchanged when the live price moves', async () => {
    const fixture = await setup();

    await fixture.placeBorrow(fixture.borrower, initialPrice);
    await fixture.lend();
    await fixture.placeBorrow(fixture.owner, movedPrice);
    await fixture.setCoveredRatio(LIQUIDATION_THRESHOLD_RATE - 100);

    const debtBefore = await fixture.debtFV();
    const snapshot = await ethers.provider.send('evm_snapshot', []);
    const baseline = await fixture.liquidationEvent(await fixture.liquidate());
    const baselineTransferredFV = (await fixture.debtFV()).sub(debtBefore);

    expect(baselineTransferredFV).to.be.gt(0);
    expect(await ethers.provider.send('evm_revert', [snapshot])).to.equal(true);

    const { transactions, receipts } = await mineTogether(
      fixture.lend,
      fixture.liquidate,
    );

    expect(receipts.map(({ status }) => status)).to.deep.equal([1, 1]);
    expect(await fixture.market.getLiveUnitPrice(fixture.orderBookId)).to.equal(
      movedPrice,
    );
    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(initialPrice);
    expect(await fixture.liquidationEvent(transactions[1])).to.deep.equal(
      baseline,
    );
    expect((await fixture.debtFV()).sub(debtBefore)).to.equal(
      baselineTransferredFV,
    );
  });

  it('uses the first reliable price immediately on an unpriced book', async () => {
    const fixture = await setup();
    await fixture.placeBorrow(fixture.borrower, initialPrice);

    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(0);

    const { transactions, receipts } = await mineTogether(
      fixture.lend,
      () =>
        fixture.wFilToETHPriceFeed.updateAnswer(
          wFilToETHRate.mul(3).div(2),
          overrides,
        ),
      fixture.liquidate,
    );

    expect(receipts.map(({ status }) => status)).to.deep.equal([1, 1, 1]);
    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(initialPrice);

    await fixture.liquidationEvent(transactions[2]);
  });

  it('intentionally rejects a marginally collateralized liquidator after a current-block debt price increase', async () => {
    const fixture = await setup();
    await fixture.placeBorrow(fixture.borrower, initialPrice);
    await fixture.lend();
    await fixture.placeBorrow(fixture.owner, movedPrice);
    await fixture.setCoveredRatio(LIQUIDATION_THRESHOLD_RATE - 100);

    // Measure the collateral received and debt assumed without a live price gap.
    const initialDeposit = await fixture.tokenVault.getDepositAmount(
      fixture.liquidator.address,
      hexETH,
    );
    const [collateralBefore] = await fixture.tokenVault.getCollateralDetail(
      fixture.liquidator.address,
      false,
    );
    const measurementSnapshot = await ethers.provider.send('evm_snapshot', []);
    await fixture.liquidationEvent(await fixture.liquidate());
    const [collateralAfter, debtAfter] =
      await fixture.tokenVault.getCollateralDetail(
        fixture.liquidator.address,
        false,
      );
    const receivedCollateral = collateralAfter.sub(collateralBefore);
    const threshold = await fixture.tokenVault.getLiquidationThresholdRate();
    const requiredCollateral = debtAfter.mul(threshold).div(PCT_DIGIT);
    // A 1% margin covers valuation pricing but not the 9600 -> 9800 live price increase.
    const remainingDepositInBase = requiredCollateral
      .add(requiredCollateral.div(100))
      .sub(receivedCollateral);
    expect(remainingDepositInBase).to.be.gt(0);
    expect(
      await ethers.provider.send('evm_revert', [measurementSnapshot]),
    ).to.equal(true);
    const remainingDeposit = await fixture.currencyController[
      'convertFromBaseCurrency(bytes32,uint256)'
    ](hexETH, remainingDepositInBase);
    await fixture.tokenVault
      .connect(fixture.liquidator)
      .withdraw(hexETH, initialDeposit.sub(remainingDeposit));

    const tightSnapshot = await ethers.provider.send('evm_snapshot', []);
    await fixture.liquidationEvent(await fixture.liquidate());
    const [tightCollateral, tightDebt] =
      await fixture.tokenVault.getCollateralDetail(
        fixture.liquidator.address,
        false,
      );
    expect(tightCollateral.mul(PCT_DIGIT)).to.be.gte(tightDebt.mul(threshold));
    expect(tightCollateral.mul(PCT_DIGIT).mul(initialPrice)).to.be.lt(
      tightDebt.mul(threshold).mul(movedPrice),
    );
    expect(
      (
        await fixture.tokenVault.isCovered(fixture.liquidator.address, hexETH)
      )[0],
    ).to.equal(true);
    expect(await ethers.provider.send('evm_revert', [tightSnapshot])).to.equal(
      true,
    );

    const balances = async () => {
      const borrowerPosition = await fixture.controller.getPosition(
        hexWFIL,
        fixture.maturity,
        fixture.borrower.address,
      );
      const liquidatorPosition = await fixture.controller.getPosition(
        hexWFIL,
        fixture.maturity,
        fixture.liquidator.address,
      );
      return [
        borrowerPosition.futureValue,
        liquidatorPosition.futureValue,
        await fixture.tokenVault.getDepositAmount(
          fixture.borrower.address,
          hexETH,
        ),
        await fixture.tokenVault.getDepositAmount(
          fixture.liquidator.address,
          hexETH,
        ),
      ];
    };
    const balancesBefore = await balances();
    const priceMoveSnapshot = await ethers.provider.send('evm_snapshot', []);
    const { receipts } = await mineTogether(fixture.lend, fixture.liquidate);
    expect(receipts.map(({ status }) => status)).to.deep.equal([1, 0]);
    expect(await fixture.market.getLiveUnitPrice(fixture.orderBookId)).to.equal(
      movedPrice,
    );
    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(initialPrice);
    await fixture.liquidateStatic().then(
      () =>
        expect.fail(
          'Expected the liquidator coverage check to reject liquidation',
        ),
      (error) =>
        expect(error.data).to.equal(
          fixture.liquidationLogic.interface.encodeErrorResult(
            'InvalidLiquidation',
            [],
          ),
        ),
    );
    expect(await balances()).to.deep.equal(balancesBefore);
    expect(receipts[1].logs).to.have.length(0);

    // The price gap is acceptable if the liquidator supplies enough collateral.
    expect(
      await ethers.provider.send('evm_revert', [priceMoveSnapshot]),
    ).to.equal(true);
    const additionalCollateral = ethers.utils.parseEther('1');
    await fixture.tokenVault
      .connect(fixture.liquidator)
      .deposit(hexETH, additionalCollateral, { value: additionalCollateral });
    const fundedResult = await mineTogether(fixture.lend, fixture.liquidate);
    expect(fundedResult.receipts.map(({ status }) => status)).to.deep.equal([
      1, 1,
    ]);
    expect(
      await fixture.market.getMarketUnitPrice(fixture.orderBookId),
    ).to.equal(initialPrice);
    await fixture.liquidationEvent(fundedResult.transactions[1]);
  });
});
