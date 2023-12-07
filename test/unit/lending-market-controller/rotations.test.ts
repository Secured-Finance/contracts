import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
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
  PRICE_DIGIT,
} from '../../common/constants';
import {
  calculateAutoRolledBorrowingCompoundFactor,
  calculateAutoRolledLendingCompoundFactor,
} from '../../common/orders';
import { deployContracts } from './utils';

const BP = ethers.BigNumber.from(PRICE_DIGIT);

describe('LendingMarketController - Rotations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
  let lendingMarketControllerProxy: Contract;
  let genesisValueVaultProxy: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;

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

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave] = await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
      fundManagementLogic,
      lendingMarketOperationLogic,
    } = await deployContracts(owner));

    lendingMarketOperationLogic = lendingMarketOperationLogic.attach(
      lendingMarketControllerProxy.address,
    );
    fundManagementLogic = fundManagementLogic.attach(
      lendingMarketControllerProxy.address,
    );

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockCurrencyController.mock[
      'convertFromBaseCurrency(bytes32,uint256)'
    ].returns('10');
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockTokenVault.mock.isCovered.returns(true);
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

    maturities = await lendingMarketControllerProxy.getMaturities(currency);
  };

  const getGenesisValues = (accounts: (SignerWithAddress | MockContract)[]) =>
    Promise.all(
      accounts.map((account) =>
        lendingMarketControllerProxy.getGenesisValue(
          targetCurrency,
          account.address,
        ),
      ),
    );

  afterEach(async () => {
    await mockCurrencyController.mock.currencyExists.returns(true);
  });

  describe('General order books', async () => {
    beforeEach(async () => {
      await initialize(targetCurrency);
    });

    it('Rotate markets multiple times under condition without lending position', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7800',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8200',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9000',
        );

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      await time.increaseTo(maturities[1].toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '9900',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '9900',
        );

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const logs = await Promise.all([
        genesisValueVaultProxy.getAutoRollLog(targetCurrency, maturities[0]),
        genesisValueVaultProxy.getAutoRollLog(targetCurrency, maturities[1]),
        genesisValueVaultProxy.getAutoRollLog(targetCurrency, maturities[2]),
      ]);

      expect(logs[0].prev).to.equal('0');
      expect(logs[0].next).to.equal(maturities[1]);
      expect(logs[0].lendingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);
      expect(logs[0].borrowingCompoundFactor).to.equal(INITIAL_COMPOUND_FACTOR);

      expect(logs[1].prev).to.equal(maturities[0]);
      expect(logs[1].next).to.equal(maturities[2]);
      expect(logs[1].lendingCompoundFactor).to.equal(
        calculateAutoRolledLendingCompoundFactor(
          logs[0].lendingCompoundFactor,
          maturities[1].sub(maturities[0]),
          logs[1].unitPrice,
        ),
      );
      expect(logs[1].borrowingCompoundFactor).to.equal(
        calculateAutoRolledBorrowingCompoundFactor(
          logs[0].borrowingCompoundFactor,
          maturities[1].sub(maturities[0]),
          logs[1].unitPrice,
        ),
      );

      expect(logs[2].prev).to.equal(maturities[1]);
      expect(logs[2].next).to.equal('0');
      expect(logs[2].lendingCompoundFactor).to.equal(
        calculateAutoRolledLendingCompoundFactor(
          logs[1].lendingCompoundFactor,
          maturities[2].sub(maturities[1]),
          logs[2].unitPrice,
        ),
      );
      expect(logs[2].borrowingCompoundFactor).to.equal(
        calculateAutoRolledBorrowingCompoundFactor(
          logs[1].borrowingCompoundFactor,
          maturities[2].sub(maturities[1]),
          logs[2].unitPrice,
        ),
      );
    });

    it('Rotate markets multiple times under condition where users have lending positions that are offset after the auto-rolls every time', async () => {
      const accounts = [alice, bob];

      let unitPrice = BigNumber.from('8000');
      for (let i = 0; i < 4; i++) {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .executeOrder(
              targetCurrency,
              maturities[i],
              i % 2 === 0 ? Side.LEND : Side.BORROW,
              '100000000000000000',
              unitPrice,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .executeOrder(
              targetCurrency,
              maturities[i],
              i % 2 === 0 ? Side.BORROW : Side.LEND,
              '100000000000000000',
              unitPrice,
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        unitPrice = unitPrice.mul('100').div('130');
      }

      const gvLog = {};
      let lastAliceGV: BigNumber | undefined;
      let lastBobGV: BigNumber | undefined;

      for (let i = 0; i < 4; i++) {
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            '8000',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .executeOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '100000000000000000',
            '8000',
          );

        await time.increaseTo(maturities[0].toString());
        await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

        maturities = await lendingMarketControllerProxy.getMaturities(
          targetCurrency,
        );

        const genesisValues = await getGenesisValues(accounts);
        gvLog[`GenesisValue(${maturities[1]})`] = {
          Alice: genesisValues[0].toString(),
          Bob: genesisValues[1].toString(),
        };

        if (lastAliceGV && lastBobGV) {
          // Check if the lending positions are offset.
          expect(genesisValues[0].add(lastAliceGV).abs()).lt(
            genesisValues[0].sub(lastAliceGV).abs(),
          );
          expect(genesisValues[1].add(lastBobGV).abs()).lt(
            genesisValues[1].sub(lastBobGV).abs(),
          );
        }

        lastAliceGV = genesisValues[0];
        lastBobGV = genesisValues[1];
      }

      console.table(gvLog);

      const reserveFundGVBefore =
        await lendingMarketControllerProxy.getGenesisValue(
          targetCurrency,
          mockReserveFund.address,
        );

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );

      const reserveFundGVAfter =
        await lendingMarketControllerProxy.getGenesisValue(
          targetCurrency,
          mockReserveFund.address,
        );

      // Check if the auto-roll fee is collected.
      expect(reserveFundGVBefore).lt(reserveFundGVAfter);

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        bob.address,
      );
      const genesisValuesAfter = await getGenesisValues(accounts);

      // These values may differ by 3 (number of fee payments) depending on the residual amount calculation logic of the genesis value.
      expect(lastAliceGV?.sub(genesisValuesAfter[0]).abs()).lte(3);
      expect(lastBobGV?.sub(genesisValuesAfter[1]).abs()).lte(3);

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        carol.address,
      );

      const totalLendingSupply =
        await genesisValueVaultProxy.getTotalLendingSupply(targetCurrency);
      const totalBorrowingSupply =
        await genesisValueVaultProxy.getTotalBorrowingSupply(targetCurrency);

      expect(totalLendingSupply).to.equal(totalBorrowingSupply);
    });

    it('Rotate markets using the unit price average(only one order) during the observation period', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9500',
        );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[1],
      );

      expect(autoRollLog.prev).to.equal(maturities[0]);
      expect(autoRollLog.unitPrice).to.equal('9500');
    });

    it('Rotate markets using the unit price average(multiple orders) during the observation period', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(carol)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000000',
          '10000',
        );
      await lendingMarketControllerProxy
        .connect(dave)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '10000',
        );

      await time.increaseTo(maturities[0].toString());

      const [aliceFVBefore, bobFVBefore] = await Promise.all(
        [alice, bob].map(async ({ address }) =>
          lendingMarketControllerProxy
            .getPosition(targetCurrency, maturities[0], address)
            .then(({ futureValue }) => futureValue),
        ),
      );

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const autoRollLogBefore = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[0],
      );
      const autoRollLogAfter = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[1],
      );

      expect(autoRollLogAfter.prev).to.equal(maturities[0]);
      expect(autoRollLogAfter.unitPrice).to.equal('8571');

      const [aliceFVAfter, bobFVAfter] = await Promise.all(
        [alice, bob].map(async ({ address }) =>
          lendingMarketControllerProxy
            .getPosition(targetCurrency, maturities[1], address)
            .then(({ futureValue }) => futureValue),
        ),
      );

      expect(aliceFVAfter).to.equal(
        BigNumberJS(aliceFVBefore.toString())
          .times(
            calculateAutoRolledLendingCompoundFactor(
              autoRollLogBefore.lendingCompoundFactor,
              maturities[1].sub(maturities[0]),
              8571,
            ).toString(),
          )
          .div(autoRollLogBefore.lendingCompoundFactor.toString())
          .dp(0)
          .toFixed(),
      );

      expect(bobFVAfter).to.equal(
        BigNumberJS(bobFVBefore.toString())
          .times(
            calculateAutoRolledBorrowingCompoundFactor(
              autoRollLogBefore.borrowingCompoundFactor,
              maturities[1].sub(maturities[0]),
              8571,
            ).toString(),
          )
          .div(autoRollLogBefore.borrowingCompoundFactor.toString())
          .dp(0)
          .toFixed(),
      );
    });

    it('Rotate markets using the estimated auto-roll price', async () => {
      const calculateUnitPrice = async (
        currentUnitPrice: number,
        maturity: BigNumber,
        destinationTimestamp: BigNumber,
      ) => {
        const { timestamp } = await ethers.provider.getBlock('latest');
        const currentDuration = maturity.sub(timestamp);
        const destinationDuration = maturity.sub(destinationTimestamp);

        return BigNumber.from(currentUnitPrice)
          .mul(currentDuration)
          .mul(BP)
          .div(
            BigNumber.from(BP)
              .sub(currentUnitPrice)
              .mul(destinationDuration)
              .add(currentDuration.mul(currentUnitPrice)),
          );
      };

      const estimatedUnitPrice = await calculateUnitPrice(
        8000,
        maturities[1],
        maturities[0],
      );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[1],
      );

      expect(autoRollLog.prev).to.equal(maturities[0]);
      expect(autoRollLog.unitPrice.sub(estimatedUnitPrice.abs())).to.lte(1);
    });

    it('Rotate markets using the past auto-roll price as an order is filled on dates too old', async () => {
      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8500',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '8100',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '8100',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await time.increaseTo(maturities[1].toString());

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[2],
      );

      expect(autoRollLog.prev).to.equal(maturities[1]);
      expect(autoRollLog.unitPrice).to.equal('8500');
    });

    it('Rotate markets using the past auto-roll price as no orders are filled', async () => {
      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8500',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await time.increaseTo(maturities[1].toString());

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[2],
      );

      expect(autoRollLog.prev).to.equal(maturities[1]);
      expect(autoRollLog.unitPrice).to.equal('8500');
    });

    it('Rotate markets including one market that has orders adjusted by with the residual amount.', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executeOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '3333333333',
          '0',
        );

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9998',
        );
      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9998',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );
      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        bob.address,
      );

      const [aliceGV, bobGV, reserveFundGV] = await getGenesisValues([
        alice,
        bob,
        mockReserveFund,
      ]);

      expect(aliceGV.add(bobGV).add(reserveFundGV)).to.equal(0);
    });

    it('Fail to rotate order books due to no currency', async () => {
      await mockCurrencyController.mock.currencyExists.returns(false);

      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(targetCurrency),
      ).revertedWith('InvalidCurrency');
    });

    it('Fail to rotate order books due to no order book', async () => {
      await expect(
        lendingMarketControllerProxy.rotateOrderBooks(
          ethers.utils.formatBytes32String('Test'),
        ),
      ).revertedWith('NotEnoughOrderBooks');
    });
  });

  describe('Pre-open order books', async () => {
    let openingDate: number;

    beforeEach(async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      openingDate = moment(timestamp * 1000)
        .add(2, 'h')
        .unix();

      await initialize(targetCurrency, openingDate);
    });

    it('Rotate markets including one market that has pre-orders adjusted by with the residual amount.', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '3333333333',
          '8000',
        );

      await time.increaseTo(openingDate);

      await lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[0],
      );

      await lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[1],
      );

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9998',
        );
      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9998',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );
      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        bob.address,
      );

      const [aliceGV, bobGV, reserveFundGV] = await getGenesisValues([
        alice,
        bob,
        mockReserveFund,
      ]);

      expect(aliceGV.add(bobGV).add(reserveFundGV)).to.equal(0);
    });

    it('Rotate markets including one market that has pre-orders partially filled and  adjusted by with the residual amount.', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '1111111111',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(alice)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '2000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .executePreOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '3333333333',
          '8000',
        );

      await time.increaseTo(openingDate);

      await lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[0],
      );

      await lendingMarketControllerProxy.executeItayoseCall(
        targetCurrency,
        maturities[1],
      );

      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());

      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9998',
        );
      await lendingMarketControllerProxy
        .connect(owner)
        .executeOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9998',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateOrderBooks(targetCurrency);

      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        alice.address,
      );
      await lendingMarketControllerProxy.cleanUpFunds(
        targetCurrency,
        bob.address,
      );

      const [aliceGV, bobGV, reserveFundGV] = await getGenesisValues([
        alice,
        bob,
        mockReserveFund,
      ]);

      expect(aliceGV.add(bobGV).add(reserveFundGV)).to.equal(0);
    });
  });
});
