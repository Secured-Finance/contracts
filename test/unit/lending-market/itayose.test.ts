import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';

import { deployContracts } from './utils';

describe('LendingMarket - Itayose', () => {
  let lendingMarketCaller: Contract;

  let targetCurrency: string;
  let maturity: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signers: SignerWithAddress[];

  let lendingMarket: Contract;
  let orderActionLogic: Contract;
  let orderBookLogic: Contract;
  let currentOrderBookId: BigNumber;
  let currentOpeningDate: number;

  const deployOrderBook = async (maturity: number, openingDate: number) => {
    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
      openingDate - 604800,
    );
    return lendingMarketCaller.getOrderBookId(targetCurrency);
  };

  const executeItayose = async () => {
    await lendingMarketCaller.initializeItayose(
      targetCurrency,
      currentOrderBookId,
    );

    let status = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    while (
      !status.remainingLendOffsetAmount.isZero() ||
      !status.remainingBorrowOffsetAmount.isZero()
    ) {
      await lendingMarketCaller.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      );
      status = await lendingMarketCaller.getItayoseProcessStatus(
        targetCurrency,
        currentOrderBookId,
      );
    }

    return lendingMarketCaller.finalizeItayose(
      targetCurrency,
      currentOrderBookId,
    );
  };

  const placeMatchedPreOrders = async (
    amount = '100000000000000',
    unitPrice = '8300',
  ) => {
    await lendingMarketCaller
      .connect(alice)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        amount,
        unitPrice,
      );
    await lendingMarketCaller
      .connect(bob)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        amount,
        unitPrice,
      );
  };

  const enterItayosePeriod = async () => {
    await time.increaseTo(currentOpeningDate - 3600);
  };

  before(async () => {
    [owner, alice, bob, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String('Test');

    ({ lendingMarketCaller, lendingMarket, orderActionLogic, orderBookLogic } =
      await deployContracts(owner, targetCurrency));
  });

  beforeEach(async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    maturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();

    currentOpeningDate = moment(timestamp * 1000)
      .add(48, 'h')
      .unix();

    currentOrderBookId = await deployOrderBook(maturity, currentOpeningDate);
  });

  const tests = [
    {
      openingPrice: '8300',
      orders: [
        { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
        { side: Side.BORROW, unitPrice: '8000', amount: '100000000000000' },
        { side: Side.LEND, unitPrice: '8300', amount: '200000000000000' },
        { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
      ],
      shouldItayoseExecuted: true,
      lastLendUnitPrice: 8300,
      lastBorrowUnitPrice: 8000,
    },
    {
      openingPrice: '8000',
      orders: [
        { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
        { side: Side.BORROW, unitPrice: '8000', amount: '200000000000000' },
        { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
        { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
      ],
      shouldItayoseExecuted: true,
      lastLendUnitPrice: 8300,
      lastBorrowUnitPrice: 8000,
    },
    {
      openingPrice: '8150',
      orders: [
        { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
        { side: Side.BORROW, unitPrice: '8000', amount: '200000000000000' },
        { side: Side.LEND, unitPrice: '8300', amount: '200000000000000' },
        { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
      ],
      shouldItayoseExecuted: true,
      lastLendUnitPrice: 8300,
      lastBorrowUnitPrice: 8000,
    },
    {
      openingPrice: '9000',
      orders: [
        { side: Side.BORROW, unitPrice: '8000', amount: '100000000000000' },
        { side: Side.BORROW, unitPrice: '8500', amount: '100000000000000' },
        { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
        { side: Side.LEND, unitPrice: '9000', amount: '300000000000000' },
      ],
      shouldItayoseExecuted: true,
      lastLendUnitPrice: 9000,
      lastBorrowUnitPrice: 8500,
    },
    {
      openingPrice: '8200',
      orders: [
        { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
        { side: Side.BORROW, unitPrice: '8100', amount: '100000000000000' },
        { side: Side.BORROW, unitPrice: '8000', amount: '50000000000000' },
        { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
        { side: Side.LEND, unitPrice: '8200', amount: '200000000000000' },
        { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
      ],
      shouldItayoseExecuted: true,
      lastLendUnitPrice: 8200,
      lastBorrowUnitPrice: 8100,
    },
    {
      openingPrice: '0',
      orders: [
        { side: Side.BORROW, unitPrice: '8000', amount: '50000000000000' },
      ],
      shouldItayoseExecuted: false,
      lastLendUnitPrice: 0,
      lastBorrowUnitPrice: 0,
    },
    {
      openingPrice: '0',
      orders: [
        { side: Side.LEND, unitPrice: '8300', amount: '100000000000000' },
      ],
      shouldItayoseExecuted: false,
      lastLendUnitPrice: 0,
      lastBorrowUnitPrice: 0,
    },
    {
      openingPrice: '0',
      orders: [
        { side: Side.BORROW, unitPrice: '8500', amount: '300000000000000' },
        { side: Side.LEND, unitPrice: '7800', amount: '300000000000000' },
      ],
      shouldItayoseExecuted: false,
      lastLendUnitPrice: 0,
      lastBorrowUnitPrice: 0,
    },
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];

    it(`Execute Itayose call(Case ${i + 1})`, async () => {
      const borrower = signers[2 * i];
      const lender = signers[2 * i + 1];

      for (const order of test.orders) {
        const user = order.side === Side.BORROW ? borrower : lender;

        await expect(
          lendingMarketCaller
            .connect(user)
            .executePreOrder(
              targetCurrency,
              currentOrderBookId,
              order.side,
              order.amount,
              order.unitPrice,
            ),
        )
          .to.emit(orderActionLogic, 'PreOrderExecuted')
          .withArgs(
            user.address,
            order.side,
            targetCurrency,
            maturity,
            order.amount,
            order.unitPrice,
            () => true,
          );
      }

      // Increase 47 hours
      await time.increase(169200);

      await executeItayose().then(async (tx) => {
        if (test.shouldItayoseExecuted) {
          await expect(tx).to.emit(orderBookLogic, 'ItayoseExecuted');
        } else {
          await expect(tx).not.to.emit(orderBookLogic, 'ItayoseExecuted');
        }
      });

      const { openingUnitPrice } = await lendingMarket.getItayoseLog(maturity);

      expect(openingUnitPrice).to.equal(test.openingPrice);

      const itayoseLog = await lendingMarket.getItayoseLog(maturity);
      const marketUnitPrice = await lendingMarket.getMarketUnitPrice(
        currentOrderBookId,
      );

      expect(itayoseLog.lastLendUnitPrice).to.equal(test.lastLendUnitPrice);
      expect(itayoseLog.lastBorrowUnitPrice).to.equal(test.lastBorrowUnitPrice);
      expect(marketUnitPrice).to.equal(
        test.shouldItayoseExecuted ? test.openingPrice : 0,
      );
    });
  }

  it('Execute Itayose call without pre-orders', async () => {
    const openingDate = await lendingMarket.getOpeningDate(currentOrderBookId);

    expect(openingDate).to.equal(currentOpeningDate);

    // Increase 47 hours
    await time.increase(169200);

    await expect(executeItayose()).to.not.emit(
      orderBookLogic,
      'ItayoseExecuted',
    );
  });

  it('Progresses through initialization, BORROW settlement, LEND settlement, and finalization', async () => {
    const amount = BigNumber.from('100000000000000');
    const unitPrice = BigNumber.from(8300);

    await placeMatchedPreOrders(amount.toString(), unitPrice.toString());
    await enterItayosePeriod();

    const statusBefore = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(statusBefore.isInProgress).to.equal(false);
    expect(statusBefore.isFinalizable).to.equal(false);
    expect(statusBefore.isReady).to.equal(false);

    await lendingMarketCaller.initializeItayose(
      targetCurrency,
      currentOrderBookId,
    );

    const initialized = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(initialized.openingUnitPrice).to.equal(unitPrice);
    expect(initialized.lastLendUnitPrice).to.equal(unitPrice);
    expect(initialized.lastBorrowUnitPrice).to.equal(unitPrice);
    expect(initialized.totalOffsetAmount).to.equal(amount);
    expect(initialized.remainingLendOffsetAmount).to.equal(amount);
    expect(initialized.remainingBorrowOffsetAmount).to.equal(amount);
    expect(initialized.isInProgress).to.equal(true);
    expect(initialized.isFinalizable).to.equal(false);
    expect(initialized.isReady).to.equal(false);
    expect(await lendingMarket.isOpened(currentOrderBookId)).to.equal(false);
    expect(await lendingMarket.isItayosePeriod(currentOrderBookId)).to.equal(
      true,
    );

    const log = await lendingMarket.getItayoseLog(maturity);
    expect(log.openingUnitPrice).to.equal(unitPrice);
    expect(log.lastLendUnitPrice).to.equal(unitPrice);
    expect(log.lastBorrowUnitPrice).to.equal(unitPrice);

    const estimation = await lendingMarket.getItayoseEstimation(
      currentOrderBookId,
    );
    expect(estimation.openingUnitPrice).to.equal(unitPrice);
    expect(estimation.lastLendUnitPrice).to.equal(unitPrice);
    expect(estimation.lastBorrowUnitPrice).to.equal(unitPrice);
    expect(estimation.totalOffsetAmount).to.equal(amount);

    const borrowSettlement =
      await lendingMarketCaller.callStatic.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      );
    expect(borrowSettlement.makerSide).to.equal(Side.BORROW);
    expect(borrowSettlement.batchFilledAmount).to.equal(amount);
    expect(borrowSettlement.partiallyFilledOrder.orderId).to.equal(0);

    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );
    const borrowSettled = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(borrowSettled.remainingBorrowOffsetAmount).to.equal(0);
    expect(borrowSettled.remainingLendOffsetAmount).to.equal(amount);
    expect(borrowSettled.isFinalizable).to.equal(false);

    const lendSettlement =
      await lendingMarketCaller.callStatic.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      );
    expect(lendSettlement.makerSide).to.equal(Side.LEND);
    expect(lendSettlement.batchFilledAmount).to.equal(amount);

    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );
    const finalizable = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(finalizable.remainingBorrowOffsetAmount).to.equal(0);
    expect(finalizable.remainingLendOffsetAmount).to.equal(0);
    expect(finalizable.isInProgress).to.equal(true);
    expect(finalizable.isFinalizable).to.equal(true);
    expect(finalizable.isReady).to.equal(false);

    await expect(
      lendingMarketCaller.finalizeItayose(targetCurrency, currentOrderBookId),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const finalized = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(finalized.isInProgress).to.equal(false);
    expect(finalized.isFinalizable).to.equal(false);
    expect(finalized.isReady).to.equal(true);

    const estimationAfterFinalize = await lendingMarket.getItayoseEstimation(
      currentOrderBookId,
    );
    expect(estimationAfterFinalize.openingUnitPrice).to.equal(0);
    expect(estimationAfterFinalize.totalOffsetAmount).to.equal(0);
  });

  it('Settles more than 500 price levels across multiple batches', async function () {
    // Instrumenting hundreds of stateful order transactions exhausts the coverage process heap.
    if (process.env.TEST_TYPE === 'coverage') this.skip();

    const amountPerPrice = BigNumber.from('100000000');
    const priceLevelCount = 501;
    const firstUnitPrice = 8000;
    const totalAmount = amountPerPrice.mul(priceLevelCount);

    for (let i = 0; i < priceLevelCount; i++) {
      await lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          amountPerPrice,
          firstUnitPrice + i,
        );
    }
    await lendingMarketCaller
      .connect(bob)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        totalAmount,
        firstUnitPrice + priceLevelCount - 1,
      );
    await enterItayosePeriod();

    await lendingMarketCaller.initializeItayose(
      targetCurrency,
      currentOrderBookId,
    );

    const firstBorrowBatch =
      await lendingMarketCaller.callStatic.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      );
    expect(firstBorrowBatch.makerSide).to.equal(Side.BORROW);
    expect(firstBorrowBatch.batchFilledAmount).to.equal(
      amountPerPrice.mul(500),
    );
    expect(firstBorrowBatch.remainingBorrowOffsetAmount).to.equal(
      amountPerPrice,
    );
    expect(firstBorrowBatch.partiallyFilledOrder.orderId).to.equal(0);
    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );

    const secondBorrowBatch =
      await lendingMarketCaller.callStatic.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      );
    expect(secondBorrowBatch.makerSide).to.equal(Side.BORROW);
    expect(secondBorrowBatch.batchFilledAmount).to.equal(amountPerPrice);
    expect(secondBorrowBatch.remainingBorrowOffsetAmount).to.equal(0);
    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );

    const lendBatch =
      await lendingMarketCaller.callStatic.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      );
    expect(lendBatch.makerSide).to.equal(Side.LEND);
    expect(lendBatch.batchFilledAmount).to.equal(totalAmount);
    expect(lendBatch.remainingLendOffsetAmount).to.equal(0);
    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );

    await lendingMarketCaller.finalizeItayose(
      targetCurrency,
      currentOrderBookId,
    );
    const finalized = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(finalized.isInProgress).to.equal(false);
    expect(finalized.isReady).to.equal(true);
  });

  it('Rejects phase calls whose process preconditions are not satisfied', async () => {
    await placeMatchedPreOrders();
    await enterItayosePeriod();

    await expect(
      lendingMarketCaller.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      ),
    ).to.be.reverted;
    await expect(
      lendingMarketCaller.finalizeItayose(targetCurrency, currentOrderBookId),
    ).to.be.reverted;

    await lendingMarketCaller.initializeItayose(
      targetCurrency,
      currentOrderBookId,
    );

    await expect(
      lendingMarketCaller.initializeItayose(targetCurrency, currentOrderBookId),
    ).to.be.reverted;
    await expect(
      lendingMarketCaller.finalizeItayose(targetCurrency, currentOrderBookId),
    ).to.be.reverted;

    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );
    await lendingMarketCaller.executeItayoseSettlement(
      targetCurrency,
      currentOrderBookId,
    );

    await expect(
      lendingMarketCaller.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      ),
    ).to.be.reverted;

    await lendingMarketCaller.finalizeItayose(
      targetCurrency,
      currentOrderBookId,
    );
    await expect(
      lendingMarketCaller.finalizeItayose(targetCurrency, currentOrderBookId),
    ).to.be.reverted;
  });

  it('Finalizes a zero-offset process without emitting ItayoseExecuted', async () => {
    await enterItayosePeriod();

    await lendingMarketCaller.initializeItayose(
      targetCurrency,
      currentOrderBookId,
    );
    const initialized = await lendingMarketCaller.getItayoseProcessStatus(
      targetCurrency,
      currentOrderBookId,
    );
    expect(initialized.totalOffsetAmount).to.equal(0);
    expect(initialized.isFinalizable).to.equal(true);

    await expect(
      lendingMarketCaller.executeItayoseSettlement(
        targetCurrency,
        currentOrderBookId,
      ),
    ).to.be.reverted;
    await expect(
      lendingMarketCaller.finalizeItayose(targetCurrency, currentOrderBookId),
    ).to.not.emit(orderBookLogic, 'ItayoseExecuted');

    expect(await lendingMarket.isReady(currentOrderBookId)).to.equal(true);
  });

  it('Rejects a zero unit price pre-order explicitly', async () => {
    await expect(
      lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          0,
        ),
    ).to.be.revertedWith('InvalidPreOrderUnitPrice');
  });

  it('Fail to create a pre-order due to an existing order with a past maturity', async () => {
    const orderBookIdBefore = currentOrderBookId;

    await lendingMarketCaller
      .connect(alice)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '100000000000000000',
        '8000',
      );
    await lendingMarketCaller
      .connect(bob)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000000',
        '8000',
      );

    // Increase 48 hours
    await time.increase(172800);

    await executeItayose().then(async (tx) => {
      await expect(tx).to.emit(orderBookLogic, 'ItayoseExecuted');
    });

    // Create the order book 255 times for testing of the circulated `lastOrderBookId`
    // to avoid exceeding the maximum value of uint8.
    for (let i = 0; i < 255; i++) {
      await time.increaseTo(maturity);

      const { timestamp: newTimestamp } = await ethers.provider.getBlock(
        'latest',
      );
      const newMaturity = moment(newTimestamp * 1000)
        .add(1, 'M')
        .unix();
      const newOpeningDate = moment(newTimestamp * 1000)
        .add(48, 'h')
        .unix();

      maturity = newMaturity;

      currentOrderBookId = await lendingMarketCaller.getOrderBookId(
        targetCurrency,
      );

      await lendingMarketCaller.executeAutoRoll(
        targetCurrency,
        currentOrderBookId,
        currentOrderBookId,
        10000,
      );

      await lendingMarketCaller.createOrderBook(
        targetCurrency,
        newMaturity,
        newOpeningDate,
        newTimestamp,
      );
    }

    // Get the circulated current order book id.
    currentOrderBookId = await lendingMarketCaller.getOrderBookId(
      targetCurrency,
    );

    expect(currentOrderBookId).to.equal(orderBookIdBefore);

    await expect(
      lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000000',
          '8000',
        ),
    ).to.be.revertedWith('PastMaturityOrderExists');

    await expect(
      lendingMarketCaller
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '100000000000000000',
          '8000',
        ),
    ).to.be.revertedWith('PastMaturityOrderExists');
  });

  it('Fail to create a pre-order due to not in the pre-order period', async () => {
    await time.increaseTo(maturity);

    await expect(
      lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '100000000000000000',
          '8720',
        ),
    ).to.be.revertedWith('NotPreOrderPeriod');
  });

  it('Fail to cancel a pre-order due to in the Itayose period', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '100000000000000000',
        '8720',
      );

    await time.increaseTo(maturity - 172800);

    await expect(
      lendingMarketCaller
        .connect(alice)
        .cancelOrder(targetCurrency, currentOrderBookId, alice.address, '1'),
    ).to.be.revertedWith('AlreadyItayosePeriod');
  });

  it('Fail to execute the Itayose call due to not in the Itayose period', async () => {
    await expect(
      lendingMarketCaller.initializeItayose(targetCurrency, currentOrderBookId),
    ).to.be.revertedWith('NotItayosePeriod');
  });

  it('Fail to execute the Itayose call due to invalid caller', async () => {
    await expect(
      lendingMarket.initializeItayose(currentOrderBookId),
    ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    await expect(
      lendingMarket.executeItayoseSettlement(currentOrderBookId),
    ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
    await expect(
      lendingMarket.finalizeItayose(currentOrderBookId),
    ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
  });
});
