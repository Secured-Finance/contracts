import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexWFIL } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { formatOrdinals } from '../common/format';
import { Signers } from '../common/signers';

describe('Performance Test: Auto-rolls', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;

  let genesisValueVault: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wFILToken: Contract;

  let fundManagementLogic: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  let signers: Signers;

  const initialFILBalance = BigNumber.from('10000000000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  const createSampleFILOrders = async (
    user: SignerWithAddress,
    maturity: BigNumber,
    unitPrice: string,
  ) => {
    await wFILToken.connect(user).approve(tokenVault.address, '3000000');
    await tokenVault.connect(user).deposit(hexWFIL, '3000000');

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexWFIL,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).add('100'),
      );

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexWFIL,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).sub('100'),
      );
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      genesisValueVault,
      tokenVault,
      lendingMarketController,
      wFILToken,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexWFIL, true);

    // Deploy active Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate,
        genesisDate - 604800,
      );
    }
    maturities = await lendingMarketController.getMaturities(hexWFIL);

    // Deploy inactive Lending Markets for Itayose
    await lendingMarketController.createOrderBook(
      hexWFIL,
      maturities[0],
      maturities[0].sub(604800),
    );
  });

  beforeEach('Reset contract instances', async () => {
    maturities = await lendingMarketController.getMaturities(hexWFIL);
  });

  /**
   * At maximum with the current implementation, auto-rolls can be executed for about 200 years at APY 20%
   * if users have a 1,000,000 token position per currency.
   *
   * - Amount: 1,000,000 * 10^18 (ex: 1,000,000 ETH, 1,000,000 wFIL)
   * - Unit Price: 9523 (APY 20%)
   * - Max Term: 200 years
   * - Initial Compound Factor: 10^18
   * - Compound Factor Decimals: 36
   *
   * If I decrease the decimals of the compound factor or increase the initial compound factor amount,
   * the calculation error of FV and PV will be larger.
   * If I increase the position amount, unit price, or term more, the calculation will be overflowed.
   */
  describe('Execute auto-rolls for 200 years', async () => {
    const orderAmount = BigNumber.from('1000000000000000000000000');

    before(async () => {
      [alice, bob, carol, dave, ellen] = await getUsers(5);
      await wFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance);
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await wFILToken
        .connect(dave)
        .approve(tokenVault.address, initialFILBalance);
      await wFILToken
        .connect(ellen)
        .approve(tokenVault.address, initialFILBalance);
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexWFIL, orderAmount.mul(2));

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexWFIL,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(bob)
          .executeOrder(hexWFIL, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Check future value
      const { futureValue: aliceActualFV } =
        await lendingMarketController.getPosition(
          hexWFIL,
          maturities[0],
          alice.address,
        );

      expect(aliceActualFV.sub('1250000000000000000000000').abs()).lte(1);
    });

    for (let i = 0; i < 800; i++) {
      it(`Execute auto-roll (${formatOrdinals(i + 1)} time)`, async () => {
        const { futureValue: aliceFV0Before } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[0],
            alice.address,
          );
        const { futureValue: aliceFV1Before } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[1],
            alice.address,
          );

        // Auto-roll
        await createSampleFILOrders(carol, maturities[1], '9523');
        await time.increaseTo(maturities[0].toString());
        await lendingMarketController.connect(owner).rotateOrderBooks(hexWFIL);
        await lendingMarketController.executeItayoseCalls(
          [hexWFIL],
          maturities[maturities.length - 1],
        );

        const aliceTotalPVAfter =
          await lendingMarketController.getTotalPresentValue(
            hexWFIL,
            alice.address,
          );

        const { lendingCompoundFactor: lendingCF0 } =
          await genesisValueVault.getAutoRollLog(hexWFIL, maturities[0]);
        const { lendingCompoundFactor: lendingCF1 } =
          await genesisValueVault.getAutoRollLog(hexWFIL, maturities[1]);

        const { futureValue: alicePV0After } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[0],
            alice.address,
          );
        const { futureValue: aliceFV1After, presentValue: alicePV1After } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[1],
            alice.address,
          );

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

    it('Fill an order', async () => {
      await tokenVault.connect(dave).deposit(hexWFIL, orderAmount.mul(2));

      await expect(
        lendingMarketController
          .connect(ellen)
          .depositAndExecuteOrder(
            hexWFIL,
            maturities[0],
            Side.LEND,
            orderAmount,
            '9523',
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await expect(
        lendingMarketController
          .connect(dave)
          .executeOrder(hexWFIL, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      // Check future value
      const { futureValue: ellenActualFV } =
        await lendingMarketController.getPosition(
          hexWFIL,
          maturities[0],
          ellen.address,
        );

      expect(ellenActualFV).to.equal('1050089257586894886065316');
    });
  });
});
