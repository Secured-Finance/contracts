import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PRICE_DIGIT,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { formatOrdinals } from '../common/format';
import {
  calculateAutoRolledLendingCompoundFactor,
  calculateOrderFee,
} from '../common/orders';
import { Signers } from '../common/signers';

const BP = ethers.BigNumber.from(PRICE_DIGIT);

describe('Integration Test: Auto-rolls', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  let futureValueVault: Contract;
  let genesisValueVault: Contract;
  let reserveFund: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarket: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;

  let fundManagementLogic: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];
  let orderBookIds: BigNumber[];

  let signers: Signers;

  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  const createSampleETHOrders = async (
    user: SignerWithAddress,
    maturity: BigNumber,
    unitPrice: string,
  ) => {
    await tokenVault.connect(user).deposit(hexETH, '3000000', {
      value: '3000000',
    });

    await lendingMarketController
      .connect(user)
      .executeOrder(hexETH, maturity, Side.BORROW, '1000000', unitPrice);

    await lendingMarketController
      .connect(user)
      .executeOrder(hexETH, maturity, Side.LEND, '1000000', unitPrice);
  };

  const executeAutoRoll = async (unitPrice?: string) => {
    if (unitPrice) {
      // Move to 6 hours (21600 sec) before maturity.
      await time.increaseTo(maturities[0].sub('21600').toString());
      // await createSampleETHOrders(carol, maturities[1], unitPrice);
      await createSampleETHOrders(owner, maturities[1], unitPrice);
    }
    await time.increaseTo(maturities[0].toString());
    await lendingMarketController.connect(owner).rotateOrderBooks(hexETH);

    await lendingMarketController
      .connect(owner)
      .executeItayoseCalls([hexETH], maturities[maturities.length - 1]);
  };

  const resetContractInstances = async () => {
    maturities = await lendingMarketController.getMaturities(hexETH);

    lendingMarket = await lendingMarketController
      .getLendingMarket(hexETH)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    orderBookIds = await lendingMarketController.getOrderBookIds(hexETH);

    futureValueVault = await lendingMarketController
      .getFutureValueVault(hexETH)
      .then((address) => ethers.getContractAt('FutureValueVault', address));
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      genesisValueVault,
      reserveFund,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);

    // Deploy active Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(hexWFIL, genesisDate);
      await lendingMarketController.createOrderBook(hexETH, genesisDate);
    }

    maturities = await lendingMarketController.getMaturities(hexETH);

    // Deploy inactive Lending Markets for Itayose
    await lendingMarketController.createOrderBook(hexWFIL, maturities[0]);
    await lendingMarketController.createOrderBook(hexETH, maturities[0]);
  });

  beforeEach('Reset contract instances', async () => {
    await resetContractInstances();
  });

  describe('Execute auto-roll with orders on the single market', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await tokenVault.connect(carol).deposit(hexETH, orderAmount.mul(10), {
        value: orderAmount.mul(10),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(carol)
          .executeOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount.mul(3),
            8000,
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(carol)
          .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 8010),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(bob)
          .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Check future value
      const { balance: aliceFVBefore } = await futureValueVault.getBalance(
        orderBookIds[0],
        alice.address,
      );
      const { balance: bobFV } = await futureValueVault.getBalance(
        orderBookIds[0],
        bob.address,
      );
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );

      expect(aliceFVBefore).to.equal('0');
      expect(bobFV).not.to.equal('0');

      await lendingMarketController.cleanUpFunds(hexETH, alice.address);
      const { balance: aliceFVAfter } = await futureValueVault.getBalance(
        orderBookIds[0],
        alice.address,
      );

      expect(aliceFVAfter).to.equal(aliceActualFV.abs());

      // Check present value
      const midUnitPrice = await lendingMarket.getMidUnitPrice(orderBookIds[0]);
      const alicePV = await lendingMarketController.getTotalPresentValue(
        hexETH,
        alice.address,
      );

      expect(alicePV).to.equal(aliceActualFV.mul(midUnitPrice).div(BP));
    });

    it('Execute auto-roll (1st time)', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndExecuteOrder(
          hexETH,
          maturities[1],
          Side.LEND,
          orderAmount.mul(2),
          8490,
          {
            value: orderAmount.mul(2),
          },
        );
      await lendingMarketController
        .connect(carol)
        .executeOrder(
          hexETH,
          maturities[1],
          Side.BORROW,
          orderAmount.mul(2),
          8510,
        );

      const { futureValue: aliceFVBefore } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );

      // Auto-roll
      await executeAutoRoll('8500');

      // Check if the orders in previous market is canceled
      const carolCoverageAfter = await tokenVault.getCoverage(carol.address);
      expect(carolCoverageAfter).to.equal('2000');

      // Check future value
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      expect(aliceActualFV).to.equal('0');

      // Check future value * genesis value
      const { futureValue: aliceFVAfter } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      const aliceGVAfter = await lendingMarketController.getGenesisValue(
        hexETH,
        alice.address,
      );

      const { lendingCompoundFactor: lendingCF0 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[0]);
      const { lendingCompoundFactor: lendingCF1 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[1]);
      const gvDecimals = await genesisValueVault.decimals(hexETH);

      expect(aliceFVAfter).to.equal(
        BigNumberJS(aliceFVBefore.toString())
          .times(lendingCF1.toString())
          .div(lendingCF0.toString())
          .dp(0)
          .toFixed(),
      );
      expect(aliceGVAfter).to.equal(
        BigNumberJS(aliceFVBefore.toString())
          .times(BigNumberJS(10).pow(gvDecimals.toString()))
          .div(lendingCF0.toString())
          .dp(0)
          .toFixed(),
      );

      // Check the saved unit price and compound factor per maturity
      const autoRollLog1 = await genesisValueVault.getAutoRollLog(
        hexETH,
        maturities[0],
      );
      const autoRollLog2 = await genesisValueVault.getAutoRollLog(
        hexETH,
        autoRollLog1.next.toString(),
      );

      expect(autoRollLog1.prev).to.equal('0');
      expect(autoRollLog2.prev).to.equal(maturities[0]);
      expect(autoRollLog2.next).to.equal('0');
      expect(autoRollLog2.unitPrice).to.equal('8500');
      expect(autoRollLog2.lendingCompoundFactor).to.equal(
        calculateAutoRolledLendingCompoundFactor(
          autoRollLog1.lendingCompoundFactor,
          maturities[1].sub(maturities[0]),
          autoRollLog2.unitPrice,
        ),
      );
    });

    it('Execute auto-roll (2nd time)', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndExecuteOrder(
          hexETH,
          maturities[1],
          Side.LEND,
          orderAmount.mul(2),
          7900,
          {
            value: orderAmount.mul(2),
          },
        );
      await lendingMarketController
        .connect(carol)
        .executeOrder(
          hexETH,
          maturities[1],
          Side.BORROW,
          orderAmount.mul(2),
          8100,
        );

      const { futureValue: aliceFVBefore } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );

      // Auto-roll
      await executeAutoRoll('8000');

      // Check future value
      const { futureValue: aliceFVAfter } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      const { lendingCompoundFactor: lendingCF0 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[0]);
      const { lendingCompoundFactor: lendingCF1 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[1]);

      expect(
        aliceFVAfter
          .sub(
            BigNumberJS(aliceFVBefore.toString())
              .times(lendingCF1.toString())
              .div(lendingCF0.toString())
              .dp(0)
              .toFixed(),
          )
          .abs(),
      ).lte(1);

      // Check the saved unit price and compound factor per maturity
      const autoRollLog1 = await genesisValueVault.getAutoRollLog(
        hexETH,
        maturities[0],
      );
      const autoRollLog2 = await genesisValueVault.getAutoRollLog(
        hexETH,
        autoRollLog1.next.toString(),
      );

      expect(autoRollLog1.prev).not.to.equal('0');
      expect(autoRollLog2.prev).to.equal(maturities[0]);
      expect(autoRollLog2.next).to.equal('0');
      expect(autoRollLog2.unitPrice).to.equal('8000');
      expect(autoRollLog2.lendingCompoundFactor).to.equal(
        calculateAutoRolledLendingCompoundFactor(
          autoRollLog1.lendingCompoundFactor,
          maturities[1].sub(maturities[0]),
          autoRollLog2.unitPrice,
        ),
      );
    });
  });

  describe('Execute auto-roll with orders on the multiple markets', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
    });

    it('Fill an order on the closest maturity market', async () => {
      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(bob)
          .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await createSampleETHOrders(carol, maturities[0], '8000');

      // Check future value
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );

      expect(aliceActualFV).equal('125000000000000000');
    });

    it('Fill an order on the second closest maturity market', async () => {
      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            maturities[1],
            Side.LEND,
            orderAmount,
            5000,
            {
              value: orderAmount,
            },
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      const tx = await lendingMarketController
        .connect(bob)
        .executeOrder(hexETH, maturities[1], Side.BORROW, orderAmount, 0);
      await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');

      await createSampleETHOrders(carol, maturities[1], '5000');

      // Check future value
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );
      const { futureValue: bobActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          bob.address,
        );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
      const fee = calculateOrderFee(
        orderAmount,
        5000,
        maturities[1].sub(timestamp),
      );

      expect(aliceActualFV).equal('200000000000000000');
      expect(bobActualFV.add(aliceActualFV).add(fee).abs()).to.lte(1);
    });

    it('Check total PVs', async () => {
      const alicePV = await lendingMarketController.getTotalPresentValue(
        hexETH,
        alice.address,
      );
      const bobPV = await lendingMarketController.getTotalPresentValue(
        hexETH,
        bob.address,
      );

      expect(alicePV).equal('200000000000000000');
      expect(alicePV.mul(10000).div(bobPV).abs().sub(9950)).to.gt(0);
    });

    it('Execute auto-roll', async () => {
      const [alicePVs, bobPVs] = await Promise.all(
        [alice, bob].map(async (user) =>
          Promise.all([
            lendingMarketController.getTotalPresentValue(hexETH, user.address),
            lendingMarketController
              .getPosition(hexETH, maturities[0], user.address)
              .then(({ presentValue }) => presentValue),
            lendingMarketController
              .getPosition(hexETH, maturities[1], user.address)
              .then(({ presentValue }) => presentValue),
          ]),
        ),
      );

      const [aliceTotalPVBefore, alicePV0Before, alicePV1Before] = alicePVs;
      const [bobTotalPVBefore, bobPV0Before, bobPV1Before] = bobPVs;

      const { futureValue: aliceFV0Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { futureValue: aliceFV1Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      expect(alicePV0Before).equal(orderAmount);
      expect(aliceTotalPVBefore).to.equal(alicePV0Before.add(alicePV1Before));
      expect(bobTotalPVBefore).to.equal(bobPV0Before.add(bobPV1Before));
      expect(
        aliceTotalPVBefore.mul(10000).div(bobTotalPVBefore).abs().sub(9950),
      ).to.gt(0);

      // Auto-roll
      await executeAutoRoll();

      const aliceTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETH,
          alice.address,
        );
      const { presentValue: alicePV0After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { presentValue: alicePV1After, futureValue: aliceFV1After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      const { lendingCompoundFactor: lendingCF0 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[0]);
      const { lendingCompoundFactor: lendingCF1 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[1]);

      // Check present value
      expect(alicePV0After).to.equal('0');
      expect(alicePV1After).to.equal(aliceTotalPVAfter);

      // Check future value
      expect(
        aliceFV1After
          .sub(
            BigNumberJS(aliceFV0Before.toString())
              .times(lendingCF1.toString())
              .div(lendingCF0.toString())
              .plus(aliceFV1Before.toString())
              .dp(0)
              .toFixed(),
          )
          .abs(),
      ).lte(1);
    });

    it('Clean orders', async () => {
      const { presentValue: alicePV0Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { presentValue: alicePV1Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      await lendingMarketController.cleanUpFunds(hexETH, alice.address);

      const { presentValue: alicePV0After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { presentValue: alicePV1After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      expect(alicePV0Before).to.equal(alicePV0After);
      expect(alicePV1Before).to.equal(alicePV1After);
      expect(alicePV1After).to.equal('0');
    });
  });

  describe('Execute auto-rolls more times than the number of markets using the past auto-roll price', async () => {
    const orderAmount = BigNumber.from('1000000000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      await resetContractInstances();
      await executeAutoRoll('8333');
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8333',
            {
              value: orderAmount,
            },
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(bob)
          .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await createSampleETHOrders(owner, maturities[1], '8333');

      // Check future value
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );

      expect(aliceActualFV).to.equal('1200048001920076803072');
    });

    for (let i = 0; i <= 9; i++) {
      it(`Execute auto-roll (${formatOrdinals(i + 1)} time)`, async () => {
        const { futureValue: aliceFV0Before } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );
        const { futureValue: aliceFV1Before } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        // Auto-roll
        await executeAutoRoll();

        const aliceTotalPVAfter =
          await lendingMarketController.getTotalPresentValue(
            hexETH,
            alice.address,
          );

        const { presentValue: alicePV0After } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );
        const { presentValue: alicePV1After, futureValue: aliceFV1After } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        const { lendingCompoundFactor: lendingCF0 } =
          await genesisValueVault.getAutoRollLog(hexETH, maturities[0]);
        const { lendingCompoundFactor: lendingCF1 } =
          await genesisValueVault.getAutoRollLog(hexETH, maturities[1]);

        // Check present value
        expect(alicePV0After).to.equal('0');
        expect(alicePV1After).to.equal(aliceTotalPVAfter);

        // Check future value
        expect(
          aliceFV1After
            .sub(
              BigNumberJS(aliceFV0Before.toString())
                .times(lendingCF1.toString())
                .div(lendingCF0.toString())
                .plus(aliceFV1Before.toString())
                .dp(0)
                .toFixed(),
            )
            .abs(),
        ).lte(1);
      });
    }
  });

  describe('Execute auto-roll with many orders, Check the FV and GV', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol, dave] = await getUsers(4);
      await resetContractInstances();
      await executeAutoRoll('8000');
      await resetContractInstances();
      await executeAutoRoll();
      await resetContractInstances();
    });

    it('Fill an order', async () => {
      await tokenVault.connect(dave).deposit(hexETH, orderAmount.mul(10), {
        value: orderAmount.mul(10),
      });

      for (const [i, user] of [alice, bob, carol].entries()) {
        await expect(
          lendingMarketController
            .connect(user)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              8000 - i,
              {
                value: orderAmount,
              },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');
      }

      await expect(
        lendingMarketController
          .connect(dave)
          .executeOrder(
            hexETH,
            maturities[0],
            Side.BORROW,
            orderAmount.mul(3),
            0,
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Check present value
      const { futureValue: daveActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          dave.address,
        );

      const midUnitPrice = await lendingMarket.getMidUnitPrice(orderBookIds[0]);
      const davePV = await lendingMarketController.getTotalPresentValue(
        hexETH,
        dave.address,
      );

      expect(davePV.sub(daveActualFV.mul(midUnitPrice).div(BP)).abs()).lte(1);
    });

    it('Check future values', async () => {
      const checkFutureValue = async () => {
        for (const { address } of [owner, alice, bob, carol]) {
          await lendingMarketController.cleanUpFunds(hexETH, address);
        }

        const fvAmounts = await Promise.all(
          [owner, alice, bob, carol, dave, reserveFund].map(({ address }) =>
            futureValueVault.getBalance(orderBookIds[0], address),
          ),
        ).then((results) => results.map(({ balance }) => balance));

        expect(
          fvAmounts.reduce(
            (total, current) => total.add(current),
            BigNumber.from(0),
          ),
        ).to.equal('0');
      };

      await checkFutureValue();
    });

    it('Execute auto-roll, Check genesis values', async () => {
      const users = [alice, bob, carol, dave, reserveFund];

      const reserveFundGVAmountBefore = await genesisValueVault.getBalance(
        hexETH,
        reserveFund.address,
      );

      // Auto-roll
      await time.increaseTo(maturities[0].toString());
      await lendingMarketController.connect(owner).rotateOrderBooks(hexETH);

      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );

      for (const { address } of users) {
        await lendingMarketController.cleanUpFunds(hexETH, address);
      }

      const [
        aliceGVAmount,
        bobGVAmount,
        carolGVAmount,
        daveGVAmount,
        reserveFundGVAmount,
      ] = await Promise.all(
        users.map(({ address }) =>
          lendingMarketController.getGenesisValue(hexETH, address),
        ),
      );

      expect(
        aliceGVAmount
          .add(bobGVAmount)
          .add(carolGVAmount)
          .add(reserveFundGVAmount.sub(reserveFundGVAmountBefore))
          .add(daveGVAmount),
      ).to.equal('0');
    });
  });

  describe('Execute auto-roll well past maturity', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      await resetContractInstances();
      await executeAutoRoll('8000');
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            {
              value: orderAmount,
            },
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(bob)
          .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Check future value
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );

      expect(aliceActualFV).to.equal('125000000000000000');
    });

    it('Advance time', async () => {
      const { presentValue: alicePV0Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { presentValue: alicePV1Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      await time.increaseTo(maturities[0].toString());
      const { presentValue: alicePV0After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { presentValue: alicePV1After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      expect(alicePV0Before).to.equal(alicePV0After);
      expect(alicePV1Before).to.equal(alicePV1After);
    });

    it('Fail to create an order due to market closure', async () => {
      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.be.revertedWith('MarketNotOpened');
    });

    it(`Execute auto-roll`, async () => {
      const { futureValue: aliceFV0Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { futureValue: aliceFV1Before } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      // Auto-roll
      await createSampleETHOrders(carol, maturities[1], '8000');
      await time.increaseTo(maturities[1].toString());
      await lendingMarketController.connect(owner).rotateOrderBooks(hexETH);

      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );

      const aliceTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETH,
          alice.address,
        );

      const { presentValue: alicePV0After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[0],
          alice.address,
        );
      const { presentValue: alicePV1After, futureValue: aliceFV1After } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[1],
          alice.address,
        );

      const { lendingCompoundFactor: lendingCF0 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[0]);
      const { lendingCompoundFactor: lendingCF1 } =
        await genesisValueVault.getAutoRollLog(hexETH, maturities[1]);

      // Check present value
      expect(alicePV0After).to.equal('0');
      expect(alicePV1After).to.equal(aliceTotalPVAfter);

      // Check future value
      expect(
        aliceFV1After
          .sub(
            BigNumberJS(aliceFV0Before.toString())
              .times(lendingCF1.toString())
              .div(lendingCF0.toString())
              .plus(aliceFV1Before.toString())
              .dp(0)
              .toFixed(),
          )
          .abs(),
      ).lte(1);
    });
  });
});
