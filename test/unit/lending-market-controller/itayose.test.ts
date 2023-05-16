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
  AUTO_ROLL_FEE_RATE,
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

  let maturities: BigNumber[];
  let targetCurrency: string;
  let currencyIdx = 0;
  let genesisDate: number;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, ...signers] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
    } = await deployContracts(owner));

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
        AUTO_ROLL_FEE_RATE,
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

      await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);

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
        ).to.emit(lendingMarketProxies[0], 'OrderMade');

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
        ).to.emit(lendingMarketProxies[1], 'OrderMade');
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

    it('Execute Itayose call after auto-rolling', async () => {
      await initialize(targetCurrency);

      await mockCurrencyController.mock.getCurrencies.returns([targetCurrency]);
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

      // Move to 48 hours (172800 sec) before maturity.
      await time.increaseTo(maturities[0].sub(172800).toString());

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
        ).to.emit(lendingMarket, 'OrderMade');
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
          lendingMarketControllerProxy.getFutureValue(
            targetCurrency,
            maturities[maturities.length - 1],
            account.address,
          ),
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
  });
});
