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
  ORDER_FEE_RATE,
} from '../../common/constants';
import { calculateFutureValue } from '../../common/orders';
import { deployContracts } from './utils';

describe('LendingMarketController - Itayose', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;
  let lendingMarketProxies: Contract[];

  let fundManagementLogic: Contract;

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave, ...signers] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
      fundManagementLogic,
    } = await deployContracts(owner));

    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockTokenVault.mock.isCovered.returns(true);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
  });

  describe('Itayose', async () => {
    const initialize = async (currency: string, openingDate = genesisDate) => {
      await lendingMarketControllerProxy.initializeLendingMarket(
        currency,
        genesisDate,
        INITIAL_COMPOUND_FACTOR,
        ORDER_FEE_RATE,
        CIRCUIT_BREAKER_LIMIT_RANGE,
      );
      for (let i = 0; i < 5; i++) {
        await lendingMarketControllerProxy.createLendingMarket(
          currency,
          openingDate,
        );
      }

      const marketAddresses =
        await lendingMarketControllerProxy.getLendingMarkets(currency);

      lendingMarketProxies = await Promise.all(
        marketAddresses.map((address) =>
          ethers.getContractAt('LendingMarket', address),
        ),
      );

      maturities = await lendingMarketControllerProxy.getMaturities(currency);
    };

    it('Execute Itayose call on the initial markets', async () => {
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

      for (const order of orders) {
        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
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
            .createPreOrder(
              targetCurrency,
              maturities[1],
              order.side,
              order.amount,
              order.unitPrice,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');
      }

      await time.increaseTo(openingDate);

      // Execute Itayose call on the first market
      await expect(
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[0],
        ),
      ).to.emit(lendingMarketProxies[0], 'ItayoseExecuted');

      const openingPrice = await lendingMarketProxies[0].getOpeningUnitPrice();

      expect(openingPrice).to.equal(expectedOpeningPrice);

      const futureValueVaultProxy: Contract = await lendingMarketControllerProxy
        .getFutureValueVault(targetCurrency, maturities[0])
        .then((address) => ethers.getContractAt('FutureValueVault', address));

      const totalSupplyAfterItayoseExecuted =
        await futureValueVaultProxy.getTotalSupply(maturities[0]);

      expect(
        totalSupplyAfterItayoseExecuted.sub(
          calculateFutureValue(expectedFilledAmount, openingPrice),
        ),
      ).lte(1);

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
            expect(unitPrice).to.lt(openingPrice);
            expect(lendingCompoundFactor).to.gt(INITIAL_COMPOUND_FACTOR);
            expect(lendingCompoundFactor).to.equal(borrowingCompoundFactor);
            expect(next).to.equal('0');
            expect(prev).to.equal('0');
            return lendingCompoundFactor;
          },
        );

      // Execute Itayose calls on all markets except the first and last.
      for (let i = 1; i < lendingMarketProxies.length - 1; i++) {
        const isOpenedBefore = await lendingMarketProxies[i].isOpened();
        expect(isOpenedBefore).to.false;

        await lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[i],
        );

        const isOpenedAfter = await lendingMarketProxies[i].isOpened();
        const { lendingCompoundFactor } =
          await genesisValueVaultProxy.getLatestAutoRollLog(targetCurrency);

        expect(isOpenedAfter).to.true;
        expect(lendingCompoundFactor).to.equal(currentLendingCompoundFactor);
      }
    });

    it('Fill a borrowing pre-order whose unit price is lower than the opening price after Itayose call.', async () => {
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

      for (const order of orders) {
        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
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
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[0],
        ),
      ).to.emit(lendingMarketProxies[0], 'ItayoseExecuted');

      const openingPrice = await lendingMarketProxies[0].getOpeningUnitPrice();

      expect(openingPrice).to.equal(expectedOpeningPrice);

      const futureValueVaultProxy: Contract = await lendingMarketControllerProxy
        .getFutureValueVault(targetCurrency, maturities[0])
        .then((address) => ethers.getContractAt('FutureValueVault', address));

      const totalSupplyAfterItayoseExecuted =
        await futureValueVaultProxy.getTotalSupply(maturities[0]);

      expect(
        totalSupplyAfterItayoseExecuted.sub(
          calculateFutureValue(expectedFilledAmount, openingPrice),
        ),
      ).lte(1);

      await expect(
        lendingMarketControllerProxy
          .connect(dave)
          .createOrder(
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

      for (const order of orders) {
        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
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
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[0],
        ),
      ).to.emit(lendingMarketProxies[0], 'ItayoseExecuted');

      const openingPrice = await lendingMarketProxies[0].getOpeningUnitPrice();

      expect(openingPrice).to.equal(expectedOpeningPrice);

      const futureValueVaultProxy: Contract = await lendingMarketControllerProxy
        .getFutureValueVault(targetCurrency, maturities[0])
        .then((address) => ethers.getContractAt('FutureValueVault', address));

      const totalSupplyAfterItayoseExecuted =
        await futureValueVaultProxy.getTotalSupply(maturities[0]);

      expect(
        totalSupplyAfterItayoseExecuted.sub(
          calculateFutureValue(expectedFilledAmount, openingPrice),
        ),
      ).lte(1);

      await expect(
        lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
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

      const lendingMarket = lendingMarketProxies[0];

      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8800',
        );

      await time.increaseTo(maturities[0].toString());
      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);
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

      for (const order of orders) {
        await expect(
          lendingMarketControllerProxy
            .connect(order.user)
            .createPreOrder(
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
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturities[maturities.length - 1],
        ),
      ).to.emit(lendingMarket, 'ItayoseExecuted');

      const openingPrice = await lendingMarket.getOpeningUnitPrice();

      expect(openingPrice).to.equal(expectedOpeningPrice);

      const futureValueVaultProxy: Contract = await lendingMarketControllerProxy
        .getFutureValueVault(targetCurrency, maturities[maturities.length - 1])
        .then((address) => ethers.getContractAt('FutureValueVault', address));

      const totalSupplyAfterItayoseExecuted =
        await futureValueVaultProxy.getTotalSupply(
          maturities[maturities.length - 1],
        );

      expect(
        totalSupplyAfterItayoseExecuted.sub(
          calculateFutureValue(expectedOffsetAmount, openingPrice),
        ),
      ).lte(1);

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
        calculateFutureValue(BigNumber.from('-100000000000000'), openingPrice),
      );
      expect(bobFV).to.equal(
        calculateFutureValue(BigNumber.from('100000000000000'), openingPrice),
      );
      expect(carolFV).to.equal('0');
    });

    it('Fill orders that are not filled with Itayose call and not the same as the opening unit price', async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const openingDate = moment(timestamp * 1000)
        .add(2, 'h')
        .unix();

      await initialize(targetCurrency, openingDate);

      const lendingMarket = lendingMarketProxies[0];
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
            .createPreOrder(
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
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturity,
        ),
      ).to.emit(lendingMarket, 'ItayoseExecuted');

      const openingPrice = await lendingMarket.getOpeningUnitPrice();
      expect(openingPrice).to.equal('7500');

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
          .createOrder(
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

      const lendingMarket = lendingMarketProxies[0];
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
            .createPreOrder(
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
        lendingMarketControllerProxy.executeItayoseCalls(
          [targetCurrency],
          maturity,
        ),
      ).to.emit(lendingMarket, 'ItayoseExecuted');

      const openingPrice = await lendingMarket.getOpeningUnitPrice();
      expect(openingPrice).to.equal('8000');

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
          .createOrder(
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
  });
});
