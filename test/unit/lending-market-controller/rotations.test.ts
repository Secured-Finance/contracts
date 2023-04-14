import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../../utils/constants';
import { getGenesisDate } from '../../../utils/dates';
import {
  AUTO_ROLL_FEE_RATE,
  INITIAL_COMPOUND_FACTOR,
  ORDER_FEE_RATE,
  PRICE_DIGIT,
} from '../../common/constants';
import { deployContracts } from './utils';

const BP = ethers.BigNumber.from(PRICE_DIGIT);

describe('LendingMarketController - Rotations', () => {
  let mockCurrencyController: MockContract;
  let mockTokenVault: MockContract;
  let mockReserveFund: MockContract;
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
  let ellen: SignerWithAddress;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;

    const { timestamp } = await ethers.provider.getBlock('latest');
    genesisDate = getGenesisDate(timestamp * 1000);
  });

  before(async () => {
    [owner, alice, bob, carol, dave, ellen, ...signers] =
      await ethers.getSigners();

    ({
      mockCurrencyController,
      mockTokenVault,
      mockReserveFund,
      lendingMarketControllerProxy,
      genesisValueVaultProxy,
      fundManagementLogic,
    } = await deployContracts(owner));

    await mockCurrencyController.mock.currencyExists.returns(true);
    await mockCurrencyController.mock.getHaircut.returns(8000);
    await mockTokenVault.mock.addDepositAmount.returns();
    await mockTokenVault.mock.removeDepositAmount.returns();
    await mockTokenVault.mock.depositFrom.returns();
    await mockTokenVault.mock.isCovered.returns(true);
  });

  const initialize = async (currency: string) => {
    await lendingMarketControllerProxy.initializeLendingMarket(
      currency,
      genesisDate,
      INITIAL_COMPOUND_FACTOR,
      ORDER_FEE_RATE,
      AUTO_ROLL_FEE_RATE,
    );
    for (let i = 0; i < 5; i++) {
      await lendingMarketControllerProxy.createLendingMarket(
        currency,
        genesisDate,
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

  beforeEach(async () => {
    await initialize(targetCurrency);
  });

  describe('Rotations', async () => {
    it('Rotate markets multiple times under condition without lending position', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '7800',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.BORROW,
          '100000000000000000',
          '8200',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9000',
        );

      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

      await time.increaseTo(maturities[1].toString());

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '9900',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '9900',
        );

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

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
        logs[0].lendingCompoundFactor
          .mul(BP.pow(2).sub(logs[1].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
          .div(logs[1].unitPrice.mul(BP)),
      );
      expect(logs[1].borrowingCompoundFactor).to.equal(
        logs[0].borrowingCompoundFactor
          .mul(BP.pow(2).add(logs[1].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
          .div(logs[1].unitPrice.mul(BP)),
      );

      expect(logs[2].prev).to.equal(maturities[1]);
      expect(logs[2].next).to.equal('0');
      expect(logs[2].lendingCompoundFactor).to.equal(
        logs[1].lendingCompoundFactor
          .mul(BP.pow(2).sub(logs[2].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
          .div(logs[2].unitPrice.mul(BP)),
      );
      expect(logs[2].borrowingCompoundFactor).to.equal(
        logs[1].borrowingCompoundFactor
          .mul(BP.pow(2).add(logs[2].unitPrice.mul(AUTO_ROLL_FEE_RATE)))
          .div(logs[2].unitPrice.mul(BP)),
      );
    });

    it('Rotate markets multiple times under condition where users have lending positions that are offset after the auto-rolls every time', async () => {
      const accounts = [alice, bob];

      const getGenesisValues = () =>
        Promise.all(
          accounts.map((account) =>
            lendingMarketControllerProxy.getGenesisValue(
              targetCurrency,
              account.address,
            ),
          ),
        );

      let unitPrice = BigNumber.from('8000');
      for (let i = 0; i < 4; i++) {
        await expect(
          lendingMarketControllerProxy
            .connect(alice)
            .createOrder(
              targetCurrency,
              maturities[i],
              i % 2 == 0 ? Side.LEND : Side.BORROW,
              '100000000000000000',
              unitPrice,
            ),
        ).to.not.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        await expect(
          lendingMarketControllerProxy
            .connect(bob)
            .createOrder(
              targetCurrency,
              maturities[i],
              i % 2 == 0 ? Side.BORROW : Side.LEND,
              '100000000000000000',
              unitPrice,
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketControllerProxy.address),
          'OrderFilled',
        );

        unitPrice = unitPrice.mul('100').div('130');
      }

      const gvLog = {};
      let lastAliceGV: BigNumber | undefined;
      let lastBobGV: BigNumber | undefined;

      for (let i = 0; i < 4; i++) {
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.LEND,
            '100000000000000000',
            '8000',
          );
        await lendingMarketControllerProxy
          .connect(carol)
          .createOrder(
            targetCurrency,
            maturities[1],
            Side.BORROW,
            '100000000000000000',
            '8000',
          );

        await time.increaseTo(maturities[0].toString());
        await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);

        maturities = await lendingMarketControllerProxy.getMaturities(
          targetCurrency,
        );

        const genesisValues = await getGenesisValues();
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
      const genesisValuesAfter = await getGenesisValues();

      // These values may differ by 2 (number of fee payments) depending on the residual amount calculation logic of the genesis value.
      expect(lastAliceGV?.sub(genesisValuesAfter[0]).abs()).lte(2);
      expect(lastBobGV?.sub(genesisValuesAfter[1]).abs()).lte(2);
    });

    it('Rotate markets using the unit price average(only one order) during the observation period', async () => {
      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
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
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '9500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '9500',
        );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

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
        .createOrder(
          targetCurrency,
          maturities[0],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
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
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '50000000000000000',
          '10000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '50000000000000000',
          '10000',
        );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[1],
      );

      expect(autoRollLog.prev).to.equal(maturities[0]);
      expect(autoRollLog.unitPrice).to.equal('8571');
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
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8000',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8000',
        );

      await time.increaseTo(maturities[0].toString());

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

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
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8500',
        );

      await lendingMarketControllerProxy
        .connect(alice)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.LEND,
          '100000000000000000',
          '8100',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[2],
          Side.BORROW,
          '100000000000000000',
          '8100',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);

      await time.increaseTo(maturities[1].toString());

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

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
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.LEND,
          '100000000000000000',
          '8500',
        );
      await lendingMarketControllerProxy
        .connect(bob)
        .createOrder(
          targetCurrency,
          maturities[1],
          Side.BORROW,
          '100000000000000000',
          '8500',
        );

      await time.increaseTo(maturities[0].toString());

      await lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency);

      await time.increaseTo(maturities[1].toString());

      await expect(
        lendingMarketControllerProxy.rotateLendingMarkets(targetCurrency),
      ).to.emit(lendingMarketControllerProxy, 'LendingMarketsRotated');

      const autoRollLog = await genesisValueVaultProxy.getAutoRollLog(
        targetCurrency,
        maturities[2],
      );

      expect(autoRollLog.prev).to.equal(maturities[1]);
      expect(autoRollLog.unitPrice).to.equal('8500');
    });
  });
});