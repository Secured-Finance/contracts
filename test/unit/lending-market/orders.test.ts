import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';
import { deployContracts, deployLendingMarket } from './utils';

describe('LendingMarket - Orders', () => {
  const targetCurrency: string = ethers.utils.formatBytes32String('Test');

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signers: SignerWithAddress[];

  let lendingMarketCaller: Contract;
  let lendingMarket: Contract;
  let orderActionLogic: Contract;

  let currentOrderBookId: BigNumber;

  const initialize = async (maturity: number, openingDate: number) => {
    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
    );
    currentOrderBookId = await lendingMarketCaller.getOrderBookId(
      targetCurrency,
    );
  };

  before(async () => {
    [owner, alice, bob, ...signers] = await ethers.getSigners();
    ({ lendingMarketCaller, orderActionLogic } = await deployContracts(owner));

    ({ lendingMarket } = await deployLendingMarket(
      targetCurrency,
      lendingMarketCaller,
    ));

    orderActionLogic = orderActionLogic.attach(lendingMarket.address);
  });

  describe('Clean up orders', async () => {
    let maturity: number;

    beforeEach(async () => {
      await ethers.provider.send('evm_setAutomine', [true]);
      const { timestamp } = await ethers.provider.getBlock('latest');
      maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();

      const openingDate = moment(timestamp * 1000).unix();

      await initialize(maturity, openingDate);
    });

    it('Clean up a lending order', async () => {
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
        .connect(bob)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '100000000000000',
          '8000',
        );

      await expect(
        lendingMarketCaller.cleanUpOrders(
          targetCurrency,
          currentOrderBookId,
          alice.address,
        ),
      )
        .to.emit(orderActionLogic, 'OrdersCleaned')
        .withArgs(
          [1],
          alice.address,
          Side.LEND,
          targetCurrency,
          maturity,
          '100000000000000',
          '125000000000000',
        );
    });

    it('Clean up a borrowing order', async () => {
      await lendingMarketCaller
        .connect(bob)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
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
          '8000',
        );

      await expect(
        lendingMarketCaller.cleanUpOrders(
          targetCurrency,
          currentOrderBookId,
          bob.address,
        ),
      )
        .to.emit(orderActionLogic, 'OrdersCleaned')
        .withArgs(
          [1],
          bob.address,
          Side.BORROW,
          targetCurrency,
          maturity,
          '100000000000000',
          '125000000000000',
        );
    });
  });

  describe('Pre-Orders', async () => {
    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();
      const openingDate = moment(timestamp * 1000)
        .add(48, 'h')
        .unix();

      await initialize(maturity, openingDate);
    });

    it('Fail to crete a lending pre-order due to opposite order existing', async () => {
      await lendingMarketCaller
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          '1000000000000000',
          '8000',
        );

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.LEND,
            '1000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Opposite side order exists');
    });

    it('Fail to crete a borrowing pre-order due to opposite order existing', async () => {
      await lendingMarketCaller
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '1000000000000000',
          '8000',
        );

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executePreOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '1000000000000000',
            '8000',
          ),
      ).to.be.revertedWith('Opposite side order exists');
    });
  });
});
