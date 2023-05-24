import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexEFIL } from '../../utils/strings';
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
  let lendingMarkets: Contract[] = [];
  let eFILToken: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  let signers: Signers;

  const initialFILBalance = BigNumber.from('10000000000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await eFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  const createSampleFILOrders = async (
    user: SignerWithAddress,
    maturity: BigNumber,
    unitPrice: string,
  ) => {
    await eFILToken.connect(user).approve(tokenVault.address, '3000000');
    await tokenVault.connect(user).deposit(hexEFIL, '3000000');

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexEFIL,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).add('100'),
      );

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexEFIL,
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
      eFILToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexEFIL, eFILToken.address, false);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexEFIL, true);

    // Deploy active Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexEFIL, genesisDate);
    }
    maturities = await lendingMarketController.getMaturities(hexEFIL);

    // Deploy inactive Lending Markets for Itayose
    await lendingMarketController.createLendingMarket(hexEFIL, maturities[0]);
  });

  beforeEach('Reset contract instances', async () => {
    maturities = await lendingMarketController.getMaturities(hexEFIL);
    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexEFIL)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
  });

  /**
   * At maximum with the current implementation, auto-rolls can be executed for about 200 years at APY 20%
   * if users have a 1,000,000 token position per currency.
   *
   * - Amount: 1,000,000 * 10^18 (ex: 1,000,000 ETH, 1,000,000 eFIL)
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
      await eFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance);
      await eFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await eFILToken
        .connect(dave)
        .approve(tokenVault.address, initialFILBalance);
      await eFILToken
        .connect(ellen)
        .approve(tokenVault.address, initialFILBalance);
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexEFIL, orderAmount.mul(2));

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexEFIL,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          ),
      ).to.emit(lendingMarkets[0], 'OrderMade');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(hexEFIL, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(lendingMarkets[0], 'OrdersTaken');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        maturities[0],
        alice.address,
      );

      expect(aliceActualFV.sub('1250000000000000000000000').abs()).lte(1);
    });

    for (let i = 0; i < 800; i++) {
      it(`Execute auto-roll (${formatOrdinals(i + 1)} time)`, async () => {
        const aliceFV0Before = await lendingMarketController.getFutureValue(
          hexEFIL,
          maturities[0],
          alice.address,
        );
        const aliceFV1Before = await lendingMarketController.getFutureValue(
          hexEFIL,
          maturities[1],
          alice.address,
        );

        // Auto-roll
        await createSampleFILOrders(carol, maturities[1], '9523');
        await time.increaseTo(maturities[0].toString());
        await lendingMarketController
          .connect(owner)
          .rotateLendingMarkets(hexEFIL);
        await lendingMarketController.executeItayoseCalls(
          [hexEFIL],
          maturities[maturities.length - 1],
        );

        // Check present value
        const aliceTotalPVAfter =
          await lendingMarketController.getTotalPresentValue(
            hexEFIL,
            alice.address,
          );
        const alicePV0After = await lendingMarketController.getPresentValue(
          hexEFIL,
          maturities[0],
          alice.address,
        );
        const alicePV1After = await lendingMarketController.getPresentValue(
          hexEFIL,
          maturities[1],
          alice.address,
        );

        // Check present value
        expect(alicePV0After).to.equal('0');
        expect(alicePV1After).to.equal(aliceTotalPVAfter);

        // Check future value
        const { lendingCompoundFactor: lendingCF0 } =
          await genesisValueVault.getAutoRollLog(hexEFIL, maturities[0]);
        const { lendingCompoundFactor: lendingCF1 } =
          await genesisValueVault.getAutoRollLog(hexEFIL, maturities[1]);
        const aliceFV1After = await lendingMarketController.getFutureValue(
          hexEFIL,
          maturities[1],
          alice.address,
        );

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
      await tokenVault.connect(dave).deposit(hexEFIL, orderAmount.mul(2));

      await expect(
        lendingMarketController
          .connect(ellen)
          .depositAndCreateOrder(
            hexEFIL,
            maturities[0],
            Side.LEND,
            orderAmount,
            '9523',
          ),
      ).to.emit(lendingMarkets[0], 'OrderMade');

      await expect(
        lendingMarketController
          .connect(dave)
          .createOrder(hexEFIL, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(lendingMarkets[0], 'OrdersTaken');

      // Check future value
      const ellenActualFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        maturities[0],
        ellen.address,
      );

      expect(ellenActualFV).to.equal('1050089257586894886065316');
    });
  });
});
