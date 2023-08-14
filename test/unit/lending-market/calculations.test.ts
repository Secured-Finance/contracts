import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';
import { deployContracts, deployOrderBooks } from './utils';

describe('LendingMarket - Calculations', () => {
  let lendingMarketCaller: Contract;

  let targetCurrency: string;
  let currencyIdx = 0;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let signers: SignerWithAddress[];

  let lendingMarket: Contract;
  let currentOrderBookId: BigNumber;

  const initialize = async (maturity: number, openingDate: number) => {
    [owner, alice, ...signers] = await ethers.getSigners();
    ({ lendingMarketCaller } = await deployContracts(owner));

    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    ({ lendingMarket } = await deployOrderBooks(
      targetCurrency,
      maturity,
      openingDate,
      lendingMarketCaller,
    ));

    currentOrderBookId = await lendingMarketCaller.getOrderBookId(
      targetCurrency,
    );
  };

  beforeEach(async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const maturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();

    await initialize(maturity, timestamp);
  });

  it('Calculate the filled amount from one lending order', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000',
        '8000',
      );

    const zeroOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      0,
      0,
    );

    expect(zeroOrderResult.lastUnitPrice).to.equal('0');
    expect(zeroOrderResult.filledAmount).to.equal('0');
    expect(zeroOrderResult.filledAmountInFV).to.equal('0');

    const marketOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '100000000000000',
      0,
    );

    expect(marketOrderResult.lastUnitPrice).to.equal('8000');
    expect(marketOrderResult.filledAmount).to.equal('100000000000000');
    expect(marketOrderResult.filledAmountInFV).to.equal('125000000000000');

    const limitOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '100000000000000',
      '8000',
    );

    expect(limitOrderResult.lastUnitPrice).to.equal('8000');
    expect(limitOrderResult.filledAmount).to.equal('100000000000000');
    expect(limitOrderResult.filledAmountInFV).to.equal('125000000000000');
  });

  it('Calculate the filled amount from one borrowing order', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '200000000000000',
        '8000',
      );

    const marketOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.LEND,
      '200000000000000',
      0,
    );

    const zeroOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.LEND,
      0,
      0,
    );

    expect(zeroOrderResult.lastUnitPrice).to.equal('0');
    expect(zeroOrderResult.filledAmount).to.equal('0');
    expect(zeroOrderResult.filledAmountInFV).to.equal('0');

    expect(marketOrderResult.lastUnitPrice).to.equal('8000');
    expect(marketOrderResult.filledAmount).to.equal('200000000000000');
    expect(marketOrderResult.filledAmountInFV).to.equal('250000000000000');

    const limitOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.LEND,
      '200000000000000',
      '8000',
    );

    expect(limitOrderResult.lastUnitPrice).to.equal('8000');
    expect(limitOrderResult.filledAmount).to.equal('200000000000000');
    expect(limitOrderResult.filledAmountInFV).to.equal('250000000000000');
  });

  it('Calculate the filled amount from multiple lending order', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000',
        '8000',
      );

    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000',
        '7900',
      );

    const marketOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '150000000000000',
      0,
    );

    expect(marketOrderResult.lastUnitPrice).to.equal('7900');
    expect(marketOrderResult.filledAmount).to.equal('150000000000000');
    expect(marketOrderResult.filledAmountInFV).to.equal('188291139240507');

    const limitOrderResult1 = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '150000000000000',
      '8000',
    );

    expect(limitOrderResult1.lastUnitPrice).to.equal('8000');
    expect(limitOrderResult1.filledAmount).to.equal('100000000000000');
    expect(limitOrderResult1.filledAmountInFV).to.equal('125000000000000');

    const limitOrderResult2 = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '150000000000000',
      '7900',
    );

    expect(limitOrderResult2.lastUnitPrice).to.equal('7900');
    expect(limitOrderResult2.filledAmount).to.equal('150000000000000');
    expect(limitOrderResult2.filledAmountInFV).to.equal('188291139240507');
  });

  it('Calculate the filled amount from multiple borrowing order', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '200000000000000',
        '8000',
      );

    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '100000000000000',
        '8100',
      );

    const marketOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.LEND,
      '250000000000000',
      0,
    );

    expect(marketOrderResult.lastUnitPrice).to.equal('8100');
    expect(marketOrderResult.filledAmount).to.equal('250000000000000');
    expect(marketOrderResult.filledAmountInFV).to.equal('311728395061729');

    const limitOrderResult1 = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.LEND,
      '250000000000000',
      '8000',
    );

    expect(limitOrderResult1.lastUnitPrice).to.equal('8000');
    expect(limitOrderResult1.filledAmount).to.equal('200000000000000');
    expect(limitOrderResult1.filledAmountInFV).to.equal('250000000000000');

    const limitOrderResult2 = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.LEND,
      '250000000000000',
      '8100',
    );

    expect(limitOrderResult2.lastUnitPrice).to.equal('8100');
    expect(limitOrderResult2.filledAmount).to.equal('250000000000000');
    expect(limitOrderResult2.filledAmountInFV).to.equal('311728395061729');
  });

  it('Calculate the blocked order amount by the circuit breaker', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000',
        '8000',
      );

    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000',
        '7000',
      );

    const marketOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '200000000000000',
      0,
    );

    expect(marketOrderResult.lastUnitPrice).to.equal('8000');
    expect(marketOrderResult.filledAmount).to.equal('100000000000000');
    expect(marketOrderResult.filledAmountInFV).to.equal('125000000000000');

    const limitOrderResult = await lendingMarket.calculateFilledAmount(
      currentOrderBookId,
      Side.BORROW,
      '200000000000000',
      '7000',
    );

    expect(limitOrderResult.lastUnitPrice).to.equal('8000');
    expect(limitOrderResult.filledAmount).to.equal('100000000000000');
    expect(limitOrderResult.filledAmountInFV).to.equal('125000000000000');
  });
});
