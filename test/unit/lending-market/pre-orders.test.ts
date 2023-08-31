import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';

import { deployContracts } from './utils';

describe('LendingMarket - Pre Orders', () => {
  let lendingMarketCaller: Contract;

  let targetCurrency: string;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let signers: SignerWithAddress[];

  let currentOrderBookId: BigNumber;

  const deployOrderBook = async (maturity: number, openingDate: number) => {
    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
    );
    return lendingMarketCaller.getOrderBookId(targetCurrency);
  };

  before(async () => {
    [owner, alice, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String('Test');

    ({ lendingMarketCaller } = await deployContracts(owner, targetCurrency));
  });

  beforeEach(async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const maturity = moment(timestamp * 1000)
      .add(1, 'M')
      .unix();
    const openingDate = moment(timestamp * 1000)
      .add(48, 'h')
      .unix();

    currentOrderBookId = await deployOrderBook(maturity, openingDate);
  });

  it('Fail to crete a lending pre-order due to opposite order existing', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '1000000000000000',
        '8000',
      );

    await expect(
      lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '1000000000000000',
          '8000',
        ),
    ).to.be.revertedWith('OppositeSideOrderExists');
  });

  it('Fail to crete a borrowing pre-order due to opposite order existing', async () => {
    await lendingMarketCaller
      .connect(alice)
      .executePreOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '1000000000000000',
        '8000',
      );

    await expect(
      lendingMarketCaller
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '1000000000000000',
          '8000',
        ),
    ).to.be.revertedWith('OppositeSideOrderExists');
  });
});
