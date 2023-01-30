import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexFILString } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  ORDERS_CALCULATION_TOLERANCE_RANGE,
  ORDER_FEE_RATE,
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

  let addressResolver: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarkets: Contract[] = [];
  let wETHToken: Contract;
  let wFILToken: Contract;
  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;

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
    await tokenVault.connect(user).deposit(hexFILString, '3000000');

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexFILString,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).sub('100'),
      );

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexFILString,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).add('100'),
      );
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      addressResolver,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexFILString, wFILToken.address, false);

    mockUniswapRouter = await ethers
      .getContractFactory('MockUniswapRouter')
      .then((factory) =>
        factory.deploy(addressResolver.address, wETHToken.address),
      );
    mockUniswapQuoter = await ethers
      .getContractFactory('MockUniswapQuoter')
      .then((factory) =>
        factory.deploy(addressResolver.address, wETHToken.address),
      );

    await mockUniswapRouter.setToken(hexFILString, wFILToken.address);
    await mockUniswapQuoter.setToken(hexFILString, wFILToken.address);

    await tokenVault.setCollateralParameters(
      ORDER_FEE_RATE,
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
      mockUniswapRouter.address,
      mockUniswapQuoter.address,
    );

    await tokenVault.updateCurrency(hexFILString, true);

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexFILString);
    }
  });

  beforeEach('Reset contract instances', async () => {
    maturities = await lendingMarketController.getMaturities(hexFILString);
    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexFILString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
  });

  /**
   * At maximum with the current implementation, auto-rolls can be executed for about 150 years at APY 20%
   * if users have a 1,000,000 token position per currency.
   *
   * - Amount: 1,000,000 * 10^18 (ex: 1,000,000 ETH, 1,000,000 eFIL)
   * - Unit Price: 9523 (APY 20%)
   * - Max Term: 150 years
   * - Initial Compound Factor: 10^24
   * - Compound Factor Decimals: 40
   *
   * If I decrease the decimals of the compound factor or increase the initial compound factor amount,
   * the calculation error of FV and PV will be larger.
   * If I increase the position amount, unit price, or term more, the calculation will be overflowed.
   */
  describe('Execute auto-rolls for 150 years', async () => {
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
      await tokenVault.connect(bob).deposit(hexFILString, orderAmount.mul(2));

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexFILString,
        maturities[0],
        alice.address,
      );

      expect(aliceActualFV.sub('1250000000000000000000000').abs()).lte(
        ORDERS_CALCULATION_TOLERANCE_RANGE,
      );
    });

    for (let i = 0; i < 600; i++) {
      it(`Execute auto-roll (${formatOrdinals(i + 1)} time)`, async () => {
        const alicePV0Before = await lendingMarketController.getPresentValue(
          hexFILString,
          maturities[0],
          alice.address,
        );
        const alicePV1Before = await lendingMarketController.getPresentValue(
          hexFILString,
          maturities[1],
          alice.address,
        );
        const midUnitPrice0 = await lendingMarkets[0].getMidUnitPrice();

        // Auto-roll
        await createSampleFILOrders(carol, maturities[1], '9523');
        await time.increaseTo(maturities[0].toString());
        await lendingMarketController
          .connect(owner)
          .rotateLendingMarkets(hexFILString);

        // Check present value
        const aliceTotalPVAfter =
          await lendingMarketController.getTotalPresentValue(
            hexFILString,
            alice.address,
          );
        const alicePV0After = await lendingMarketController.getPresentValue(
          hexFILString,
          maturities[0],
          alice.address,
        );
        const alicePV1After = await lendingMarketController.getPresentValue(
          hexFILString,
          maturities[1],
          alice.address,
        );

        const aliceTotalPV = alicePV0Before
          .mul('10000')
          .div(midUnitPrice0)
          .add(alicePV1Before);

        expect(alicePV0After).to.equal('0');
        expect(alicePV1After).to.equal(aliceTotalPVAfter);
        expect(aliceTotalPVAfter.sub(aliceTotalPV).abs()).lte(
          ORDERS_CALCULATION_TOLERANCE_RANGE,
        );
      });
    }

    it('Fill an order', async () => {
      await tokenVault.connect(dave).deposit(hexFILString, orderAmount.mul(2));

      await expect(
        lendingMarketController
          .connect(ellen)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            orderAmount,
            '9523',
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(dave)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      // Check future value
      const ellenActualFV = await lendingMarketController.getFutureValue(
        hexFILString,
        maturities[0],
        ellen.address,
      );

      expect(ellenActualFV.sub('1050089257586894886065314').abs()).lte(
        ORDERS_CALCULATION_TOLERANCE_RANGE,
      );
    });
  });
});
