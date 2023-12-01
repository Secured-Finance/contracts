import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { expect } from 'chai';
import { deployContracts } from './utils';

describe('LendingMarket - Auto-rolls', () => {
  let lendingMarketCaller: Contract;
  let lendingMarket: Contract;

  let targetCurrency: string;
  let maturity: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signers: SignerWithAddress[];

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
    [owner, alice, bob, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String('Test');

    ({ lendingMarketCaller, lendingMarket } = await deployContracts(
      owner,
      targetCurrency,
    ));
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

  it('Execute an auto-roll', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const maturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();
    const openingDate = moment(timestamp * 1000).unix();

    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
      openingDate - 604800,
    );

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

    await lendingMarketCaller.executeAutoRoll(
      targetCurrency,
      currentOrderBookId,
      currentOrderBookId,
      newMaturity,
      newOpeningDate,
      10000,
    );
  });

  it('Fail to execute an auto-roll due to invalid caller', async () => {
    await expect(
      lendingMarketCaller.executeAutoRoll(
        targetCurrency,
        currentOrderBookId,
        currentOrderBookId,
        1,
        1,
        10000,
      ),
    ).revertedWith('OrderBookNotMatured');
  });

  it('Fail to execute an auto-roll due to invalid caller', async () => {
    await expect(
      lendingMarket.executeAutoRoll(
        currentOrderBookId,
        currentOrderBookId,
        1,
        1,
        10000,
      ),
    ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
  });
});
