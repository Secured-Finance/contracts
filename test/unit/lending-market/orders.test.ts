import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';

import { calculateFutureValue } from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarket - Orders', () => {
  let mockCurrencyController: MockContract;
  let lendingMarketCaller: Contract;
  let lendingMarket: Contract;

  let targetCurrency: string;
  let maturity: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signers: SignerWithAddress[];

  let orderActionLogic: Contract;
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
    [owner, alice, bob, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String('Test');

    ({
      mockCurrencyController,
      lendingMarketCaller,
      lendingMarket,
      orderActionLogic,
    } = await deployContracts(owner, targetCurrency));

    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('100000');
  });

  describe('Check the block unit price', async () => {
    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();
      const openingDate = moment(timestamp * 1000).unix();

      currentOrderBookId = await deployOrderBook(maturity, openingDate);
    });

    afterEach(async () => {
      const isAutomine = await ethers.provider.send('hardhat_getAutomine', []);

      if (!isAutomine) {
        await ethers.provider.send('evm_setAutomine', [true]);
      }
    });

    const fillOrder = async (amount: string, unitPrice: string) => {
      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          amount,
          unitPrice,
        );

      await lendingMarketCaller
        .connect(bob)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          amount,
          unitPrice,
        );
    };

    const checkBlockUnitPrice = async (
      marketUnitPrice: string,
      blockUnitPriceAverage: string,
    ) => {
      expect(
        await lendingMarket.getMarketUnitPrice(currentOrderBookId),
      ).to.equal(marketUnitPrice);

      expect(
        await lendingMarket.getBlockUnitPriceAverage(currentOrderBookId, 5),
      ).to.equal(blockUnitPriceAverage);
    };

    it('Check with a single order', async () => {
      await fillOrder('100000000000000', '8000');

      await checkBlockUnitPrice('8000', '0');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8000', '8000');
    });

    it('Check with multiple orders in the same block', async () => {
      await ethers.provider.send('evm_setAutomine', [false]);

      await fillOrder('100000000000000', '8000');
      await fillOrder('200000000000000', '9000');

      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_setAutomine', [true]);

      await checkBlockUnitPrice('8640', '0');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8640', '8640');
    });

    it('Check with multiple orders in the different block', async () => {
      await fillOrder('100000000000000', '8000');
      await fillOrder('200000000000000', '9000');

      await checkBlockUnitPrice('8000', '8000');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('9000', '8500');
    });

    it('Check with 5 orders in the different block', async () => {
      await fillOrder('100000000000000', '8000');
      await fillOrder('200000000000000', '8100');
      await fillOrder('300000000000000', '8200');
      await fillOrder('400000000000000', '8300');
      await fillOrder('500000000000000', '8400');

      await checkBlockUnitPrice('8300', '8150');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8400', '8200');
    });

    it('Check with over 5 orders in the different block', async () => {
      await fillOrder('100000000000000', '8000');
      await fillOrder('200000000000000', '8100');
      await fillOrder('300000000000000', '8200');
      await fillOrder('400000000000000', '8300');
      await fillOrder('500000000000000', '8400');
      await fillOrder('600000000000000', '8500');

      await checkBlockUnitPrice('8400', '8200');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8500', '8300');
    });

    it('Check with unwinding', async () => {
      await fillOrder('100000000000000', '8000');

      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8000', '8000');

      await lendingMarketCaller
        .connect(bob)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '150000000000000',
          '9000',
        );

      await lendingMarketCaller
        .connect(alice)
        .unwindPosition(
          targetCurrency,
          currentOrderBookId,
          Side.BORROW,
          calculateFutureValue('100000000000000', '8000'),
        );

      await checkBlockUnitPrice('8000', '8000');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('9000', '8500');
    });

    it('Check with an order less than the reliable amount', async () => {
      await fillOrder('99999', '8000');

      await checkBlockUnitPrice('8000', '0');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8000', '8000');

      await fillOrder('99999', '8100');

      await checkBlockUnitPrice('8000', '8000');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8000', '8000');

      await fillOrder('99999', '8200');

      await checkBlockUnitPrice('8000', '8000');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8000', '8000');
    });

    it('Check with an order equal to the reliable amount', async () => {
      await fillOrder('99999', '8000');

      await checkBlockUnitPrice('8000', '0');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8000', '8000');

      await fillOrder('100000', '8300');

      await checkBlockUnitPrice('8000', '8000');
      await ethers.provider.send('evm_mine', []);
      await checkBlockUnitPrice('8300', '8150');
    });
  });

  describe('Execute pre-orders', async () => {
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

  describe('Clean up orders', async () => {
    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      maturity = moment(timestamp * 1000)
        .add(1, 'M')
        .unix();
      const openingDate = moment(timestamp * 1000).unix();

      currentOrderBookId = await deployOrderBook(maturity, openingDate);
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
});
