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

  before(async () => {
    [owner, alice, ...signers] = await ethers.getSigners();
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

      await lendingMarketCaller
        .executeItayoseCall(targetCurrency, currentOrderBookId)
        .then(async (tx) => {
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

    await expect(
      lendingMarketCaller.executeItayoseCall(
        targetCurrency,
        currentOrderBookId,
      ),
    ).to.not.emit(orderBookLogic, 'ItayoseExecuted');
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
      lendingMarketCaller.executeItayoseCall(
        targetCurrency,
        currentOrderBookId,
      ),
    ).to.be.revertedWith('NotItayosePeriod');
  });

  it('Fail to execute the Itayose call due to invalid caller', async () => {
    await expect(
      lendingMarket.executeItayoseCall(currentOrderBookId),
    ).to.be.revertedWith('OnlyAcceptedContract("LendingMarketController")');
  });
});
