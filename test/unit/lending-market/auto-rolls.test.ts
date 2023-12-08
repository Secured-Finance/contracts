import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { Contract } from 'ethers';
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

  let currentOpeningDate: number;

  const deployOrderBook = async (maturity: number, openingDate: number) => {
    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
      openingDate - 604800,
    );
    return lendingMarketCaller.getMaturity(targetCurrency);
  };

  before(async () => {
    [owner] = await ethers.getSigners();
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

    await deployOrderBook(maturity, currentOpeningDate);
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

    await lendingMarketCaller.executeAutoRoll(
      targetCurrency,
      maturity,
      maturity,
      10000,
    );
  });

  it('Fail to execute an auto-roll due to non-matured order book', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const newMaturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();

    const newOpeningDate = moment(timestamp * 1000)
      .add(48, 'h')
      .unix();

    await deployOrderBook(newMaturity, newOpeningDate);

    await expect(
      lendingMarketCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        newMaturity,
        10000,
      ),
    ).revertedWith('OrderBookNotMatured');
  });

  it('Fail to execute an auto-roll due to invalid maturity (matured order book)', async () => {
    await expect(
      lendingMarketCaller.executeAutoRoll(targetCurrency, 1, 1, 10000),
    ).revertedWith('InvalidMaturity(1)');
  });

  it('Fail to execute an auto-roll due to invalid maturity (destination order book)', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const newMaturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();

    await time.increaseTo(maturity);

    await expect(
      lendingMarketCaller.executeAutoRoll(
        targetCurrency,
        maturity,
        newMaturity,
        10000,
      ),
    ).revertedWith(`InvalidMaturity(${newMaturity})`);
  });

  it('Fail to execute an auto-roll due to invalid caller', async () => {
    await expect(
      lendingMarket.executeAutoRoll(maturity, maturity, 10000),
    ).revertedWith('OnlyAcceptedContract("LendingMarketController")');
  });
});
