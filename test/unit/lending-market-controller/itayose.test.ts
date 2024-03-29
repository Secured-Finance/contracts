import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

import { Side } from '../../../utils/constants';
import { getGenesisDate } from '../../../utils/dates';
import {
  CIRCUIT_BREAKER_LIMIT_RANGE,
  INITIAL_COMPOUND_FACTOR,
  MIN_DEBT_UNIT_PRICE,
  ORDER_FEE_RATE,
} from '../../common/constants';
import { calculateFutureValue } from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarketController - Itayose', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockERC20: MockContract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;
  let lendingMarketProxy: Contract;
  let lendingMarketReader: Contract;

  let fundManagementLogic: Contract;
  let orderBookLogic: Contract;

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();

    ({
      mockERC20,
      mockCurrencyController,
      mockTokenVault,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
      lendingMarketReader,
      fundManagementLogic,
      orderBookLogic,
    } = await deployContracts(owner));

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
    await mockTokenVault.mock.isCovered.returns(true, true);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.cleanUpUsedCurrencies.returns();
    await mockTokenVault.mock.depositWithPermitFrom.returns();
    await mockTokenVault.mock.getTokenAddress.returns(mockERC20.address);
    await mockERC20.mock.decimals.returns(18);
  });

  const initialize = async (currency: string, openingDate = genesisDate) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      CIRCUIT_BREAKER_LIMIT_RANGE,
      MIN_DEBT_UNIT_PRICE,
    );
    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createOrderBook(
        currency,
        openingDate,
        openingDate - 604800,
      );
    }

    lendingMarketProxy = await lendingMarketControllerProxy
      .getLendingMarket(currency)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    maturities = await lendingMarketControllerProxy.getMaturities(currency);

    orderBookLogic = orderBookLogic.attach(lendingMarketProxy.address);
  };

  it('Get Itayose estimation with no pre-orders', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const estimation = await lendingMarketReader.getItayoseEstimation(
      targetCurrency,
      maturities[0],
    );

    expect(estimation.openingUnitPrice).to.equal('0');
    expect(estimation.lastLendUnitPrice).to.equal('0');
    expect(estimation.lastBorrowUnitPrice).to.equal('0');
  });

  it('Execute Itayose call on the initial markets, the opening price become the same as the lending order', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    await genesisValueVaultProxy
      .getLatestAutoRollLog(targetCurrency)
      .then(
        ({
          unitPrice,
          lendingCompoundFactor,
          borrowingCompoundFactor,
          next,
          prev,
        }) => {
          expect(unitPrice).to.equal('10000');
          expect(lendingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
          expect(borrowingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
          expect(next).to.equal('0');
          expect(prev).to.equal('0');
        },
      );

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8500',
        amount: '300000000000000',
        user: carol,
      },
      {
        side: Side.BORROW,
        unitPrice: '8000',
        amount: '100000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8300',
        amount: '200000000000000',
        user: bob,
      },
    ];

    // the matching amount of the above orders
    const expectedOpeningPrice = '8300';
    const expectedFilledAmount = BigNumber.from('100000000000000');
    const expectedPartiallyFilledAmount = BigNumber.from('100000000000000');

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[0],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[1],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    const estimation = await lendingMarketReader.getItayoseEstimation(
      targetCurrency,
      maturities[0],
    );

    // Execute Itayose call on the first market
    const tx = await lendingMarketControllerProxy.executeItayoseCall(
      targetCurrency,
      maturities[0],
    );
    await expect(tx).to.emit(orderBookLogic, 'ItayoseExecuted');
    await expect(tx)
      .to.emit(fundManagementLogic, 'OrderPartiallyFilled')
      .withArgs(
        3,
        bob.address,
        targetCurrency,
        Side.LEND,
        maturities[0],
        '100000000000000',
        calculateFutureValue('100000000000000', expectedOpeningPrice),
      );

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturities[0],
    );

    expect(openingUnitPrice).to.equal(expectedOpeningPrice);
    expect(estimation.openingUnitPrice).to.equal(expectedOpeningPrice);
    expect(estimation.lastLendUnitPrice).to.equal('8300');
    expect(estimation.lastBorrowUnitPrice).to.equal('8000');

    const pendingOrderAmount =
      await lendingMarketControllerProxy.getPendingOrderAmount(
        targetCurrency,
        maturities[0],
      );

    expect(pendingOrderAmount).to.equal(
      expectedFilledAmount.mul(2).sub(expectedPartiallyFilledAmount),
    );

    const currentLendingCompoundFactor = await genesisValueVaultProxy
      .getLatestAutoRollLog(targetCurrency)
      .then(
        ({
          unitPrice,
          lendingCompoundFactor,
          borrowingCompoundFactor,
          next,
          prev,
        }) => {
          expect(unitPrice).to.lt(openingUnitPrice);
          expect(lendingCompoundFactor).to.gt(INITIAL_COMPOUND_FACTOR);
          expect(lendingCompoundFactor).to.equal(borrowingCompoundFactor);
          expect(next).to.equal('0');
          expect(prev).to.equal('0');
          return lendingCompoundFactor;
        },
      );

    // Execute Itayose calls on all markets except the first and last.
    const orderBookIds = await lendingMarketControllerProxy.getOrderBookIds(
      targetCurrency,
    );
    for (let i = 1; i < orderBookIds.length - 1; i++) {
      const isOpenedBefore = await lendingMarketProxy.isOpened(orderBookIds[i]);
      expect(isOpenedBefore).to.false;

      await lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[i],
      );

      const isOpenedAfter = await lendingMarketProxy.isOpened(orderBookIds[i]);
      const { lendingCompoundFactor } =
        await genesisValueVaultProxy.getLatestAutoRollLog(targetCurrency);

      expect(isOpenedAfter).to.true;
      expect(lendingCompoundFactor).to.equal(currentLendingCompoundFactor);
    }
  });

  it('Execute Itayose call on the initial markets, the opening price become the same as the borrowing order', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    await genesisValueVaultProxy
      .getLatestAutoRollLog(targetCurrency)
      .then(
        ({
          unitPrice,
          lendingCompoundFactor,
          borrowingCompoundFactor,
          next,
          prev,
        }) => {
          expect(unitPrice).to.equal('10000');
          expect(lendingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
          expect(borrowingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
          expect(next).to.equal('0');
          expect(prev).to.equal('0');
        },
      );

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8500',
        amount: '300000000000000',
        user: carol,
      },
      {
        side: Side.LEND,
        unitPrice: '8600',
        amount: '200000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8300',
        amount: '200000000000000',
        user: bob,
      },
    ];

    // the matching amount of the above orders
    const expectedOpeningPrice = '8500';
    const expectedFilledAmount = BigNumber.from('200000000000000');
    const expectedPartiallyFilledAmount = BigNumber.from('200000000000000');

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[0],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[1],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    const estimation = await lendingMarketReader.getItayoseEstimation(
      targetCurrency,
      maturities[0],
    );

    // Execute Itayose call on the first market
    const tx = await lendingMarketControllerProxy.executeItayoseCall(
      targetCurrency,
      maturities[0],
    );
    await expect(tx).to.emit(orderBookLogic, 'ItayoseExecuted');
    await expect(tx)
      .to.emit(fundManagementLogic, 'OrderPartiallyFilled')
      .withArgs(
        1,
        carol.address,
        targetCurrency,
        Side.BORROW,
        maturities[0],
        '200000000000000',
        calculateFutureValue('200000000000000', expectedOpeningPrice),
      );

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturities[0],
    );

    expect(openingUnitPrice).to.equal(expectedOpeningPrice);
    expect(estimation.openingUnitPrice).to.equal(expectedOpeningPrice);
    expect(estimation.lastLendUnitPrice).to.equal('8600');
    expect(estimation.lastBorrowUnitPrice).to.equal('8500');

    const pendingOrderAmount =
      await lendingMarketControllerProxy.getPendingOrderAmount(
        targetCurrency,
        maturities[0],
      );

    expect(pendingOrderAmount).to.equal(
      expectedFilledAmount.mul(2).sub(expectedPartiallyFilledAmount),
    );
  });

  it('Fill a borrowing pre-order whose unit price is lower than the opening price after Itayose call', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8020',
        amount: '100000000000000',
        user: carol,
      },
      {
        side: Side.BORROW,
        unitPrice: '8000',
        amount: '200000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8100',
        amount: '200000000000000',
        user: bob,
      },
      {
        side: Side.LEND,
        unitPrice: '8010',
        amount: '300000000000000',
        user: dave,
      },
    ];

    // the matching amount of the above orders
    const expectedOpeningPrice = '8050';
    const expectedFilledAmount = BigNumber.from('200000000000000');
    const expectedPartiallyFilledAmount = BigNumber.from('0');

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[0],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    // Execute Itayose call on the first market
    await expect(
      lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[0],
      ),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturities[0],
    );

    expect(openingUnitPrice).to.equal(expectedOpeningPrice);

    const pendingOrderAmount =
      await lendingMarketControllerProxy.getPendingOrderAmount(
        targetCurrency,
        maturities[0],
      );

    expect(pendingOrderAmount).to.equal(
      expectedFilledAmount.mul(2).sub(expectedPartiallyFilledAmount),
    );

    await expect(
      lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000',
          '8020',
        ),
    ).to.emit(fundManagementLogic, 'OrderFilled');

    const { futureValue: carolFV } =
      await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturities[0],
        carol.address,
      );

    expect(carolFV.abs()).to.equal(
      calculateFutureValue(BigNumber.from('100000000000000'), '8020'),
    );
  });

  it('Fill a lending pre-order whose unit price is higher than the opening price after Itayose call.', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8070',
        amount: '100000000000000',
        user: carol,
      },
      {
        side: Side.BORROW,
        unitPrice: '8000',
        amount: '200000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8100',
        amount: '200000000000000',
        user: bob,
      },
      {
        side: Side.LEND,
        unitPrice: '8060',
        amount: '300000000000000',
        user: dave,
      },
    ];

    // the matching amount of the above orders
    const expectedOpeningPrice = '8050';
    const expectedFilledAmount = BigNumber.from('200000000000000');
    const expectedPartiallyFilledAmount = BigNumber.from('0');

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[0],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    // Execute Itayose call on the first market
    await expect(
      lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[0],
      ),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturities[0],
    );

    expect(openingUnitPrice).to.equal(expectedOpeningPrice);

    const pendingOrderAmount =
      await lendingMarketControllerProxy.getPendingOrderAmount(
        targetCurrency,
        maturities[0],
      );

    expect(pendingOrderAmount).to.equal(
      expectedFilledAmount.mul(2).sub(expectedPartiallyFilledAmount),
    );

    await expect(
      lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '300000000000000',
          '8060',
        ),
    ).to.emit(fundManagementLogic, 'OrderFilled');

    const { futureValue: daveFV } =
      await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturities[0],
        dave.address,
      );

    expect(daveFV.abs()).to.equal(
      calculateFutureValue(BigNumber.from('300000000000000'), '8060'),
    );
  });

  it('Execute Itayose call after auto-rolling', async () => {
    await initialize(targetCurrency);

    await lendingMarketControllerProxy
      .connect(bob)
      .executeOrder(
        targetCurrency,
        maturities[1],
        Side.BORROW,
        '50000000000000000',
        '8000',
      );
    await lendingMarketControllerProxy
      .connect(bob)
      .executeOrder(
        targetCurrency,
        maturities[1],
        Side.BORROW,
        '100000000000000000',
        '8800',
      );

    await time.increaseTo(maturities[0].toString());
    await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);
    maturities = await lendingMarketControllerProxy.getMaturities(
      targetCurrency,
    );

    // Move to 7 days (604800 sec) before maturity.
    await time.increaseTo(maturities[0].sub(604800).toString());

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8500',
        amount: '300000000000000',
        user: carol,
      },
      {
        side: Side.BORROW,
        unitPrice: '8000',
        amount: '100000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8300',
        amount: '200000000000000',
        user: bob,
      },
    ];

    // the matching amount of the above orders
    const expectedOpeningPrice = '8300';
    const expectedOffsetAmount = BigNumber.from('100000000000000');
    const expectedPartiallyFilledAmount = BigNumber.from('100000000000000');

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[maturities.length - 1],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(maturities[maturities.length - 2].toString());

    await expect(
      lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[maturities.length - 1],
      ),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturities[maturities.length - 1],
    );

    expect(openingUnitPrice).to.equal(expectedOpeningPrice);

    const pendingOrderAmount =
      await lendingMarketControllerProxy.getPendingOrderAmount(
        targetCurrency,
        maturities[maturities.length - 1],
      );

    expect(pendingOrderAmount).to.equal(
      expectedOffsetAmount.mul(2).sub(expectedPartiallyFilledAmount),
    );

    const [aliceFV, bobFV, carolFV] = await Promise.all(
      [alice, bob, carol].map((account) =>
        lendingMarketControllerProxy
          .getPosition(
            targetCurrency,
            maturities[maturities.length - 1],
            account.address,
          )
          .then(({ futureValue }) => futureValue),
      ),
    );

    expect(aliceFV).to.equal(
      calculateFutureValue(
        BigNumber.from('-100000000000000'),
        openingUnitPrice,
      ),
    );
    expect(bobFV).to.equal(
      calculateFutureValue(BigNumber.from('100000000000000'), openingUnitPrice),
    );
    expect(carolFV).to.equal('0');
  });

  it('Fill orders that are not filled with Itayose call and not the same as the opening unit price', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const maturity = maturities[0];

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8000',
        amount: '300000000000000',
        user: carol,
      },
      {
        side: Side.BORROW,
        unitPrice: '7300',
        amount: '100000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '7500',
        amount: '200000000000000',
        user: bob,
      },
    ];

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturity,
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    await expect(
      lendingMarketControllerProxy.executeItayoseCall(targetCurrency, maturity),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturity,
    );
    expect(openingUnitPrice).to.equal('7500');

    const { futureValue: carolFVBefore } =
      await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturity,
        carol.address,
      );

    expect(carolFVBefore).to.equal('0');

    await expect(
      lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturity,
          Side.LEND,
          '300000000000000',
          '8500',
        ),
    ).to.emit(fundManagementLogic, 'OrderFilled');

    const { futureValue: carolFVAfter } =
      await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturity,
        carol.address,
      );

    expect(carolFVAfter).to.equal('-375000000000000');
  });

  it('Fill orders that are not filled with Itayose call and the same as the opening unit price', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const maturity = maturities[0];

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8500',
        amount: '300000000000000',
        user: carol,
      },
      {
        side: Side.BORROW,
        unitPrice: '7800',
        amount: '100000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8000',
        amount: '200000000000000',
        user: bob,
      },
    ];

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturity,
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    await expect(
      lendingMarketControllerProxy.executeItayoseCall(targetCurrency, maturity),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const { openingUnitPrice } = await lendingMarketProxy.getItayoseLog(
      maturity,
    );
    expect(openingUnitPrice).to.equal('8000');

    const { futureValue: bobFVBefore } =
      await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturity,
        bob.address,
      );

    expect(bobFVBefore).to.equal('125000000000000');

    await expect(
      lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturity,
          Side.BORROW,
          '100000000000000',
          '8000',
        ),
    ).to.emit(fundManagementLogic, 'OrderFilled');

    const { futureValue: bobFVAfter } =
      await lendingMarketControllerProxy.getPosition(
        targetCurrency,
        maturity,
        bob.address,
      );

    expect(bobFVAfter).to.equal('250000000000000');
  });

  it('Filled pre-order should be returned as inactive orders with opening unit price', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const orders = [
      {
        side: Side.BORROW,
        unitPrice: '8070',
        amount: '100000000000000',
        user: alice,
      },
      {
        side: Side.BORROW,
        unitPrice: '8000',
        amount: '200000000000000',
        user: alice,
      },
      {
        side: Side.LEND,
        unitPrice: '8100',
        amount: '200000000000000',
        user: bob,
      },
      {
        side: Side.LEND,
        unitPrice: '8060',
        amount: '300000000000000',
        user: bob,
      },
    ];

    // the matching amount of the above orders
    const expectedOpeningPrice = '8050';
    const expectedLastLendUnitPrice = '8100';
    const expectedLastBorrowUnitPrice = '8000';

    for (const order of orders) {
      await expect(
        lendingMarketControllerProxy
          .connect(order.user)
          .executePreOrder(
            targetCurrency,
            maturities[0],
            order.side,
            order.amount,
            order.unitPrice,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    }

    await time.increaseTo(openingDate);

    // Execute Itayose call on the first market
    await expect(
      lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[0],
      ),
    ).to.emit(orderBookLogic, 'ItayoseExecuted');

    const { openingUnitPrice, lastLendUnitPrice, lastBorrowUnitPrice } =
      await lendingMarketProxy.getItayoseLog(maturities[0]);

    expect(openingUnitPrice).to.equal(expectedOpeningPrice);
    expect(lastLendUnitPrice).to.equal(expectedLastLendUnitPrice);
    expect(lastBorrowUnitPrice).to.equal(expectedLastBorrowUnitPrice);

    const aliceOrders = await lendingMarketReader[
      'getOrders(bytes32[],address)'
    ]([targetCurrency], alice.address);

    expect(aliceOrders.activeOrders.length).to.equal(1);
    expect(aliceOrders.inactiveOrders.length).to.equal(1);

    expect(aliceOrders.activeOrders[0].ccy).to.equal(targetCurrency);
    expect(aliceOrders.activeOrders[0].side).to.equal(Side.BORROW);
    expect(aliceOrders.activeOrders[0].unitPrice).to.equal('8070');
    expect(aliceOrders.activeOrders[0].maturity).to.equal(maturities[0]);
    expect(aliceOrders.activeOrders[0].amount).to.equal('100000000000000');
    expect(aliceOrders.activeOrders[0].isPreOrder).to.equal(true);

    expect(aliceOrders.inactiveOrders[0].ccy).to.equal(targetCurrency);
    expect(aliceOrders.inactiveOrders[0].side).to.equal(Side.BORROW);
    expect(aliceOrders.inactiveOrders[0].unitPrice).to.equal(openingUnitPrice);
    expect(aliceOrders.inactiveOrders[0].maturity).to.equal(maturities[0]);
    expect(aliceOrders.inactiveOrders[0].amount).to.equal('200000000000000');
    expect(aliceOrders.inactiveOrders[0].isPreOrder).to.equal(true);

    let bobOrders = await lendingMarketReader['getOrders(bytes32[],address)'](
      [targetCurrency],
      bob.address,
    );

    expect(bobOrders.activeOrders.length).to.equal(1);
    expect(bobOrders.inactiveOrders.length).to.equal(1);

    expect(bobOrders.activeOrders[0].ccy).to.equal(targetCurrency);
    expect(bobOrders.activeOrders[0].side).to.equal(Side.LEND);
    expect(bobOrders.activeOrders[0].unitPrice).to.equal('8060');
    expect(bobOrders.activeOrders[0].maturity).to.equal(maturities[0]);
    expect(bobOrders.activeOrders[0].amount).to.equal('300000000000000');
    expect(bobOrders.activeOrders[0].isPreOrder).to.equal(true);

    expect(bobOrders.inactiveOrders[0].ccy).to.equal(targetCurrency);
    expect(bobOrders.inactiveOrders[0].side).to.equal(Side.LEND);
    expect(bobOrders.inactiveOrders[0].unitPrice).to.equal(openingUnitPrice);
    expect(bobOrders.inactiveOrders[0].maturity).to.equal(maturities[0]);
    expect(bobOrders.inactiveOrders[0].amount).to.equal('200000000000000');
    expect(bobOrders.inactiveOrders[0].isPreOrder).to.equal(true);

    await expect(
      lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '300000000000000',
          '0',
        ),
    ).to.emit(fundManagementLogic, 'OrderFilled');

    bobOrders = await lendingMarketReader['getOrders(bytes32[],address)'](
      [targetCurrency],
      bob.address,
    );

    expect(bobOrders.activeOrders.length).to.equal(0);
    expect(bobOrders.inactiveOrders.length).to.equal(2);

    expect(bobOrders.inactiveOrders[1].ccy).to.equal(targetCurrency);
    expect(bobOrders.inactiveOrders[1].side).to.equal(Side.LEND);
    expect(bobOrders.inactiveOrders[1].unitPrice).to.equal('8060');
    expect(bobOrders.inactiveOrders[1].maturity).to.equal(maturities[0]);
    expect(bobOrders.inactiveOrders[1].amount).to.equal('300000000000000');
    expect(bobOrders.inactiveOrders[1].isPreOrder).to.equal(true);
  });

  it('Crete a pre-order with permit', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    const deadline = ethers.constants.MaxUint256;
    const v = 1;
    const r = ethers.utils.formatBytes32String('dummy');
    const s = ethers.utils.formatBytes32String('dummy');

    await expect(
      lendingMarketControllerProxy
        .connect(alice)
        .depositWithPermitAndExecutePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '10000000000000000',
          '8800',
          deadline,
          v,
          r,
          s,
        ),
    ).to.not.emit(fundManagementLogic, 'OrderFilled');
  });

  it('Fail to create an order due to too many orders', async () => {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const openingDate = moment(timestamp * 1000)
      .add(2, 'h')
      .unix();

    await initialize(targetCurrency, openingDate);

    for (let i = 0; i < 20; i++) {
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
    }

    await expect(
      lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        ),
    ).to.be.revertedWith('TooManyActiveOrders');
  });

  it('Fail to create an pre-order due to invalid maturity', async () => {
    await expect(
      lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          '1',
          Side.LEND,
          '100000000000000000',
          '8000',
        ),
    ).to.be.revertedWith('InvalidMaturity');
  });

  it('Fail to create an pre-order and deposit token due to invalid maturity', async () => {
    await expect(
      lendingMarketControllerProxy
        .connect(alice)
        .depositAndExecutesPreOrder(
          targetCurrency,
          '1',
          Side.LEND,
          '10000000000000000',
          '0',
        ),
    ).to.be.revertedWith('InvalidMaturity');
  });

  it('Fail to create an pre-order and deposit token with permit due to invalid maturity', async () => {
    await expect(
      lendingMarketControllerProxy
        .connect(alice)
        .depositWithPermitAndExecutePreOrder(
          targetCurrency,
          '1',
          Side.LEND,
          '10000000000000000',
          '0',
          ethers.constants.MaxUint256,
          1,
          ethers.utils.formatBytes32String('dummy'),
          ethers.utils.formatBytes32String('dummy'),
        ),
    ).to.be.revertedWith('InvalidMaturity');
  });
});
