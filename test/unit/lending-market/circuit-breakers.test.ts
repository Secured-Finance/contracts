import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';
import { calculateFutureValue, calculateOrderFee } from '../../common/orders';

import { deployContracts } from './utils';

describe('LendingMarket - Circuit Breakers', () => {
  let lendingMarketCaller: Contract;
  let mockCurrencyController: MockContract;

  let targetCurrency: string;
  let maturity: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let signers: SignerWithAddress[];

  let lendingMarket: Contract;
  let orderActionLogic: Contract;
  let currentOrderBookId: BigNumber;

  const deployOrderBook = async (maturity: number, openingDate: number) => {
    await lendingMarketCaller.createOrderBook(
      targetCurrency,
      maturity,
      openingDate,
      openingDate,
    );
    return lendingMarketCaller.getOrderBookId(targetCurrency);
  };

  before(async () => {
    [owner, alice, bob, carol, ...signers] = await ethers.getSigners();
    targetCurrency = ethers.utils.formatBytes32String('Test');

    ({
      mockCurrencyController,
      lendingMarketCaller,
      lendingMarket,
      orderActionLogic,
    } = await deployContracts(owner, targetCurrency));

    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
  });

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

  const fillOrder = async (unitPrice: number) => {
    await lendingMarketCaller
      .connect(owner)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.LEND,
        '100000000000000',
        unitPrice,
      );

    await lendingMarketCaller
      .connect(owner)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        Side.BORROW,
        '100000000000000',
        unitPrice,
      );
  };

  const createInitialOrders = async (side: number, unitPrice: number) => {
    const offsetUnitPrice =
      side === Side.LEND ? unitPrice * 0.95 - 1 : unitPrice * 1.1 + 1;

    await fillOrder(unitPrice);

    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        side,
        '100000000000000',
        unitPrice,
      );

    await lendingMarketCaller
      .connect(alice)
      .executeOrder(
        targetCurrency,
        currentOrderBookId,
        side,
        '100000000000000',
        offsetUnitPrice,
      );

    return offsetUnitPrice;
  };

  describe('Get circuit breaker thresholds', async () => {
    it('Get circuit breaker thresholds without the last block price', async () => {
      const { maxLendUnitPrice, minBorrowUnitPrice } =
        await lendingMarket.getCircuitBreakerThresholds(currentOrderBookId);

      expect(maxLendUnitPrice).to.equal('10000');
      expect(minBorrowUnitPrice).to.equal('1');
    });

    it('Get circuit breaker thresholds with the last block price', async () => {
      await fillOrder(8000);

      await ethers.provider.send('evm_mine', []);

      const { maxLendUnitPrice, minBorrowUnitPrice } =
        await lendingMarket.getCircuitBreakerThresholds(currentOrderBookId);

      expect(maxLendUnitPrice).to.equal('8800');
      expect(minBorrowUnitPrice).to.equal('7600');
    });
  });

  for (const side of [Side.BORROW, Side.LEND]) {
    const title = side === Side.BORROW ? 'Borrow orders' : 'Lend orders';

    describe(title, async () => {
      const isBorrow = side == Side.BORROW;

      before(function () {
        if (process.env.TEST_TYPE == 'coverage') {
          // The test fails because `solidity-coverage` do not work nicely with `evm_setAutomine` and `evm_mine`.
          // To avoid this, those tests are skipped when running coverage test.
          this.skip();
        }
      });

      for (const orderType of ['market', 'limit']) {
        it(`Fill an order partially until the circuit breaker threshold using the ${orderType} order`, async () => {
          let unitPrice = await createInitialOrders(
            isBorrow ? Side.LEND : Side.BORROW,
            8500,
          );

          if (orderType == 'market') {
            unitPrice = 0;
          }

          await expect(
            lendingMarketCaller
              .connect(bob)
              .executeOrder(
                targetCurrency,
                currentOrderBookId,
                side,
                '200000000000000',
                unitPrice,
              ),
          )
            .to.emit(orderActionLogic, 'OrderExecuted')
            .withArgs(
              bob.address,
              side,
              targetCurrency,
              maturity,
              '200000000000000',
              unitPrice,
              '100000000000000',
              '8500',
              () => true,
              () => true,
              0,
              0,
              0,
              true,
            );
        });
      }

      it('Execute multiple transactions to fill orders in one block with the circuit breaker triggered', async () => {
        await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

        await ethers.provider.send('evm_setAutomine', [false]);

        const bobTx = await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '50000000000000',
            0,
          );

        const carolTx = await lendingMarketCaller
          .connect(carol)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '150000000000000',
            '0',
          );

        await ethers.provider.send('evm_mine', []);

        await expect(bobTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            bob.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            '0',
            '50000000000000',
            '8500',
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );

        await expect(carolTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '150000000000000',
            '0',
            '50000000000000',
            '8500',
            () => true,
            () => true,
            0,
            0,
            0,
            true,
          );
      });

      it('Fill an order in different blocks after the circuit breaker has been triggered', async () => {
        const offsetUnitPrice = await createInitialOrders(
          isBorrow ? Side.LEND : Side.BORROW,
          8500,
        );

        await ethers.provider.send('evm_setAutomine', [false]);

        const bobTx = await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '100000000000000',
            '0',
          );

        const carolTx = await lendingMarketCaller
          .connect(carol)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '50000000000000',
            '0',
          );

        await ethers.provider.send('evm_mine', []);

        await expect(bobTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            bob.address,
            side,
            targetCurrency,
            maturity,
            '100000000000000',
            '0',
            '100000000000000',
            '8500',
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );

        await expect(carolTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            '0',
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            true,
          );

        await fillOrder(isBorrow ? offsetUnitPrice + 1 : offsetUnitPrice - 1);

        await ethers.provider.send('evm_mine', []);
        await ethers.provider.send('evm_setAutomine', [true]);

        await expect(
          lendingMarketCaller
            .connect(carol)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '50000000000000',
              '0',
            ),
        )
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            '0',
            '50000000000000',
            offsetUnitPrice,
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );
      });

      it('Fill an order in the same block after the circuit breaker has been triggered', async () => {
        const oppositeOrderSide = isBorrow ? Side.LEND : Side.BORROW;
        const lendingOrderAmount = 8500 + (isBorrow ? 500 : -500);
        await createInitialOrders(oppositeOrderSide, 8500);

        await ethers.provider.send('evm_setAutomine', [false]);

        await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '100000000000000',
            '0',
          );

        const carolTx1 = await lendingMarketCaller
          .connect(carol)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '50000000000000',
            0,
          );

        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            oppositeOrderSide,
            '100000000000000',
            lendingOrderAmount,
          );

        const carolTx2 = await lendingMarketCaller
          .connect(carol)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '50000000000000',
            0,
          );

        await ethers.provider.send('evm_mine', []);

        await expect(carolTx1)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            '0',
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            true,
          );

        await expect(carolTx2)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            '0',
            '50000000000000',
            lendingOrderAmount,
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );
      });

      it('Fail to place a second market order in the same block due to no filled amount', async () => {
        await createInitialOrders(isBorrow ? Side.LEND : Side.BORROW, 8500);

        await ethers.provider.send('evm_setAutomine', [false]);

        const bobTx = await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '100000000000000',
            '0',
          );

        const carolTx = await lendingMarketCaller
          .connect(carol)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '50000000000000',
            '0',
          );

        await ethers.provider.send('evm_mine', []);

        await expect(bobTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            bob.address,
            side,
            targetCurrency,
            maturity,
            '100000000000000',
            '0',
            '100000000000000',
            8500,
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );

        await expect(carolTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            '0',
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            true,
          );
      });

      it('Fail to place a second limit order in the same block due to over the circuit breaker threshold', async () => {
        const offsetUnitPrice = await createInitialOrders(
          isBorrow ? Side.LEND : Side.BORROW,
          8500,
        );

        await ethers.provider.send('evm_setAutomine', [false]);

        const bobTx = await lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '100000000000000',
            '0',
          );

        const carolTx = await lendingMarketCaller
          .connect(carol)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            side,
            '50000000000000',
            offsetUnitPrice,
          );

        await ethers.provider.send('evm_mine', []);

        await expect(bobTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            bob.address,
            side,
            targetCurrency,
            maturity,
            '100000000000000',
            '0',
            '100000000000000',
            8500,
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );

        await expect(carolTx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            side,
            targetCurrency,
            maturity,
            '50000000000000',
            offsetUnitPrice,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            true,
          );
      });

      it(`Fill an order within the circuit breaker that has under the minimum rage`, async () => {
        const unitPrice = 800;
        const unitPrice2 = isBorrow ? 700 : 900;

        await fillOrder(unitPrice);

        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            isBorrow ? Side.LEND : Side.BORROW,
            '100000000000000',
            unitPrice2,
          );

        await expect(
          lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
            ),
        )
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            bob.address,
            side,
            targetCurrency,
            maturity,
            '100000000000000',
            '0',
            '100000000000000',
            unitPrice2,
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );
      });

      it(`Fill an order within the circuit breaker that has reached ${
        isBorrow ? 'min' : 'max'
      } unit price`, async () => {
        const unitPrice = isBorrow ? 99 : 9500;
        const unitPrice2 = isBorrow ? 1 : 10000;

        await fillOrder(unitPrice);

        await lendingMarketCaller
          .connect(alice)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            isBorrow ? Side.LEND : Side.BORROW,
            '100000000000000',
            unitPrice2,
          );

        await expect(
          lendingMarketCaller
            .connect(bob)
            .executeOrder(
              targetCurrency,
              currentOrderBookId,
              side,
              '100000000000000',
              '0',
            ),
        )
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            bob.address,
            side,
            targetCurrency,
            maturity,
            '100000000000000',
            '0',
            '100000000000000',
            unitPrice2,
            () => true,
            () => true,
            0,
            0,
            0,
            false,
          );
      });
    });
  }

  describe('Unwind positions', async () => {
    it('Unwind a position partially until the circuit breaker threshold', async () => {
      await createInitialOrders(Side.LEND, 8000);

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000',
            0,
          ),
      ).to.emit(orderActionLogic, 'OrderExecuted');

      await createInitialOrders(Side.BORROW, 8500);

      const tx = await lendingMarketCaller
        .connect(bob)
        .unwindPosition(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '125000000000000',
        );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);

      await expect(tx)
        .to.emit(orderActionLogic, 'PositionUnwound')
        .withArgs(
          bob.address,
          Side.LEND,
          targetCurrency,
          maturity,
          calculateFutureValue('100000000000000', 8000),
          '100000000000000',
          '8500',
          calculateFutureValue('100000000000000', 8500),
          calculateOrderFee(
            '100000000000000',
            8500,
            BigNumber.from(maturity).sub(timestamp),
          ),
          true,
        );
    });

    it('Unwind no position due to circuit breaker', async function () {
      if (process.env.TEST_TYPE == 'coverage') {
        this.skip();
      }

      await createInitialOrders(Side.LEND, 8000);

      await expect(
        lendingMarketCaller
          .connect(bob)
          .executeOrder(
            targetCurrency,
            currentOrderBookId,
            Side.BORROW,
            '100000000000000',
            0,
          ),
      ).to.emit(orderActionLogic, 'OrderExecuted');

      await createInitialOrders(Side.BORROW, 8500);

      await ethers.provider.send('evm_setAutomine', [false]);

      await lendingMarketCaller
        .connect(alice)
        .executeOrder(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '100000000000000',
          0,
        );

      const tx = await lendingMarketCaller
        .connect(bob)
        .unwindPosition(
          targetCurrency,
          currentOrderBookId,
          Side.LEND,
          '125000000000000',
        );

      await ethers.provider.send('evm_mine', []);

      await expect(tx)
        .to.emit(orderActionLogic, 'PositionUnwound')
        .withArgs(
          bob.address,
          Side.LEND,
          targetCurrency,
          maturity,
          calculateFutureValue('100000000000000', 8000),
          0,
          0,
          0,
          0,
          true,
        );
    });
  });
});
