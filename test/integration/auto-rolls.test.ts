import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETHString, hexFILString } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { formatOrdinals } from '../common/format';
import { Signers } from '../common/signers';

const BP = ethers.BigNumber.from('10000');

describe('Integration Test: Auto-rolls', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  let addressResolver: Contract;
  let futureValueVaults: Contract[];
  let genesisValueVault: Contract;
  let reserveFund: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarkets: Contract[] = [];
  let wETHToken: Contract;
  let wFILToken: Contract;
  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;

  let maturities: BigNumber[];

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
    await tokenVault.connect(user).deposit(hexETHString, '3000000', {
      value: '3000000',
    });

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexETHString,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).sub('1000'),
      );

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexETHString,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).add('1000'),
      );
  };

  const executeAutoRoll = async (unitPrice?: string) => {
    if (unitPrice) {
      await createSampleETHOrders(carol, maturities[1], unitPrice);
    }
    await time.increaseTo(maturities[0].toString());
    await lendingMarketController
      .connect(owner)
      .rotateLendingMarkets(hexETHString);
  };

  const resetContractInstances = async () => {
    maturities = await lendingMarketController.getMaturities(hexETHString);
    [lendingMarkets, futureValueVaults] = await Promise.all([
      lendingMarketController
        .getLendingMarkets(hexETHString)
        .then((addresses) =>
          Promise.all(
            addresses.map((address) =>
              ethers.getContractAt('LendingMarket', address),
            ),
          ),
        ),
      Promise.all(
        maturities.map((maturity) =>
          lendingMarketController
            .getFutureValueVault(hexETHString, maturity)
            .then((address) =>
              ethers.getContractAt('FutureValueVault', address),
            ),
        ),
      ),
    ]);
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      addressResolver,
      genesisValueVault,
      reserveFund,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address, false);
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

    await mockUniswapRouter.setToken(hexETHString, wETHToken.address);
    await mockUniswapRouter.setToken(hexFILString, wFILToken.address);
    await mockUniswapQuoter.setToken(hexETHString, wETHToken.address);
    await mockUniswapQuoter.setToken(hexFILString, wFILToken.address);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
      mockUniswapRouter.address,
      mockUniswapQuoter.address,
    );

    await tokenVault.updateCurrency(hexETHString, true);

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexFILString);
      await lendingMarketController.createLendingMarket(hexETHString);
    }
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
      await tokenVault.connect(bob).deposit(hexETHString, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await tokenVault
        .connect(carol)
        .deposit(hexETHString, orderAmount.mul(10), {
          value: orderAmount.mul(10),
        });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexETHString,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carol)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.LEND,
            orderAmount.mul(3),
            8000,
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carol)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            7990,
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      // Check future value
      const { futureValue: aliceFVBefore } =
        await futureValueVaults[0].getFutureValue(alice.address);
      const { futureValue: bobFV } = await futureValueVaults[0].getFutureValue(
        bob.address,
      );
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[0],
        alice.address,
      );

      expect(aliceFVBefore).to.equal('0');
      expect(bobFV).not.to.equal('0');

      await lendingMarketController.cleanOrders(hexETHString, alice.address);
      const { futureValue: aliceFVAfter } =
        await futureValueVaults[0].getFutureValue(alice.address);

      expect(aliceFVAfter).to.equal(aliceActualFV.abs());

      // Check present value
      const midUnitPrice = await lendingMarkets[0].getMidUnitPrice();
      const alicePV = await lendingMarketController.getTotalPresentValue(
        hexETHString,
        alice.address,
      );

      expect(alicePV).to.equal(aliceActualFV.mul(midUnitPrice).div(BP));
    });

    it('Execute auto-roll (1st time)', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndCreateOrder(
          hexETHString,
          maturities[1],
          Side.LEND,
          orderAmount.mul(2),
          8510,
          {
            value: orderAmount.mul(2),
          },
        );
      await lendingMarketController
        .connect(carol)
        .createOrder(
          hexETHString,
          maturities[1],
          Side.BORROW,
          orderAmount.mul(2),
          8490,
        );

      const aliceTotalPVBefore =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );

      const midUnitPrice0 = await lendingMarkets[0].getMidUnitPrice();

      // Auto-roll
      await executeAutoRoll();

      // Check if the orders in previous market is canceled
      const carolCoverageAfter = await tokenVault.getCoverage(carol.address);
      expect(carolCoverageAfter).to.equal('2000');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      expect(aliceActualFV).to.equal('0');

      // Check present value
      const aliceTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );
      const bobTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          bob.address,
        );

      expect(
        aliceTotalPVAfter
          .sub(aliceTotalPVBefore.mul('10000').div(midUnitPrice0))
          .abs(),
      ).lte(1);
      expect(
        aliceTotalPVAfter.mul(10000).div(bobTotalPVAfter).abs().sub(9975).abs(),
      ).to.lte(1);

      // Check the saved unit price and compound factor per maturity
      const maturityUnitPrice1 = await genesisValueVault.getMaturityUnitPrice(
        hexETHString,
        maturities[0],
      );
      const maturityUnitPrice2 = await genesisValueVault.getMaturityUnitPrice(
        hexETHString,
        maturityUnitPrice1.next.toString(),
      );

      expect(maturityUnitPrice1.prev).to.equal('0');
      expect(maturityUnitPrice2.prev).to.equal(maturities[0]);
      expect(maturityUnitPrice2.next).to.equal('0');
      expect(maturityUnitPrice2.unitPrice).to.equal('8500');
      expect(maturityUnitPrice2.compoundFactor).to.equal(
        maturityUnitPrice1.compoundFactor
          .mul('10000')
          .div(maturityUnitPrice2.unitPrice),
      );
    });

    it('Execute auto-roll (2nd time)', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndCreateOrder(
          hexETHString,
          maturities[1],
          Side.LEND,
          orderAmount.mul(2),
          8100,
          {
            value: orderAmount.mul(2),
          },
        );
      await lendingMarketController
        .connect(carol)
        .createOrder(
          hexETHString,
          maturities[1],
          Side.BORROW,
          orderAmount.mul(2),
          7900,
        );

      const aliceTotalPVBefore =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );

      const midUnitPrice = await lendingMarkets[0].getMidUnitPrice();

      // Auto-roll
      await executeAutoRoll('8000');

      // Check present value
      const aliceTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );
      const bobTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          bob.address,
        );

      expect(
        aliceTotalPVAfter
          .sub(aliceTotalPVBefore.mul('10000').div(midUnitPrice))
          .abs(),
      ).lte(1);
      expect(
        aliceTotalPVAfter.mul(10000).div(bobTotalPVAfter).abs().sub(9975).abs(),
      ).to.lte(1);

      // Check the saved unit price and compound factor per maturity
      const maturityUnitPrice1 = await genesisValueVault.getMaturityUnitPrice(
        hexETHString,
        maturities[0],
      );
      const maturityUnitPrice2 = await genesisValueVault.getMaturityUnitPrice(
        hexETHString,
        maturityUnitPrice1.next.toString(),
      );

      expect(maturityUnitPrice1.prev).not.to.equal('0');
      expect(maturityUnitPrice2.prev).to.equal(maturities[0]);
      expect(maturityUnitPrice2.next).to.equal('0');
      expect(maturityUnitPrice2.unitPrice).to.equal('8000');
      expect(maturityUnitPrice2.compoundFactor).to.equal(
        maturityUnitPrice1.compoundFactor
          .mul('10000')
          .div(maturityUnitPrice2.unitPrice),
      );
    });
  });

  describe('Execute auto-roll with orders on the multiple markets', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
    });

    it('Fill an order on the closest maturity market', async () => {
      await tokenVault.connect(bob).deposit(hexETHString, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexETHString,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      await createSampleETHOrders(carol, maturities[0], '8000');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[0],
        alice.address,
      );

      expect(aliceActualFV).equal('125000000000000000');
    });

    it('Fill an order on the second closest maturity market', async () => {
      await tokenVault.connect(bob).deposit(hexETHString, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexETHString,
            maturities[1],
            Side.LEND,
            orderAmount,
            5000,
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[1], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(
            hexETHString,
            maturities[1],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[1], 'TakeOrders');

      await createSampleETHOrders(carol, maturities[1], '5000');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[1],
        alice.address,
      );
      const bobActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[1],
        bob.address,
      );

      expect(aliceActualFV).equal('200000000000000000');
      expect(aliceActualFV.mul(10000).div(bobActualFV).abs()).to.equal('9949');
    });

    it('Check total PVs', async () => {
      const alicePV = await lendingMarketController.getTotalPresentValue(
        hexETHString,
        alice.address,
      );
      const bobPV = await lendingMarketController.getTotalPresentValue(
        hexETHString,
        bob.address,
      );

      expect(alicePV.sub('200000000000000000').abs()).lte(1);
      expect(alicePV.mul(10000).div(bobPV).abs().sub(9950)).to.gt(0);
    });

    it('Execute auto-roll', async () => {
      const aliceTotalPVBefore =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );
      const bobTotalPVBefore =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          bob.address,
        );
      const alicePV0Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );

      expect(alicePV0Before.sub(orderAmount)).lte(1);
      expect(aliceTotalPVBefore).to.equal(alicePV0Before.add(alicePV1Before));
      expect(
        aliceTotalPVBefore.mul(10000).div(bobTotalPVBefore).abs().sub(9950),
      ).to.gt(0);

      const midUnitPrice0 = await lendingMarkets[0].getMidUnitPrice();

      // Auto-roll
      await executeAutoRoll();

      // Check present value
      const aliceTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );
      const alicePV0After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );
      const aliceTotalPV = alicePV0Before
        .mul('10000')
        .div(midUnitPrice0)
        .add(alicePV1Before);

      expect(alicePV0After).to.equal('0');
      expect(alicePV1After).to.equal(aliceTotalPVAfter);
      expect(aliceTotalPVAfter.sub(aliceTotalPV).abs()).lte(1);
    });

    it('Clean orders', async () => {
      const alicePV0Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );

      await lendingMarketController.cleanOrders(hexETHString, alice.address);

      const alicePV0After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );

      expect(alicePV0Before).to.equal(alicePV0After);
      expect(alicePV1Before).to.equal(alicePV1After);
      expect(alicePV1After).to.equal('0');
    });
  });

  describe('Execute auto-rolls more times than the number of markets', async () => {
    const orderAmount = BigNumber.from('1000000000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      await resetContractInstances();
      await executeAutoRoll('8333');
    });

    it('Fill an order', async () => {
      await tokenVault.connect(bob).deposit(hexETHString, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexETHString,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8333',
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[0],
        alice.address,
      );

      expect(aliceActualFV).to.equal('1200048001920076803072');
    });

    for (let i = 0; i < 9; i++) {
      it(`Execute auto-roll (${formatOrdinals(i + 1)} time)`, async () => {
        const alicePV0Before = await lendingMarketController.getPresentValue(
          hexETHString,
          maturities[0],
          alice.address,
        );
        const alicePV1Before = await lendingMarketController.getPresentValue(
          hexETHString,
          maturities[1],
          alice.address,
        );
        const midUnitPrice0 = await lendingMarkets[0].getMidUnitPrice();

        // Auto-roll
        await executeAutoRoll('8333');

        // Check present value
        const aliceTotalPVAfter =
          await lendingMarketController.getTotalPresentValue(
            hexETHString,
            alice.address,
          );
        const alicePV0After = await lendingMarketController.getPresentValue(
          hexETHString,
          maturities[0],
          alice.address,
        );
        const alicePV1After = await lendingMarketController.getPresentValue(
          hexETHString,
          maturities[1],
          alice.address,
        );

        const aliceTotalPV = alicePV0Before
          .mul('10000')
          .div(midUnitPrice0)
          .add(alicePV1Before);

        expect(alicePV0After).to.equal('0');
        expect(alicePV1After).to.equal(aliceTotalPVAfter);
        expect(aliceTotalPVAfter.sub(aliceTotalPV).abs()).lte(2);
      });
    }
  });

  describe('Execute auto-roll with many orders, Check the FV and GV', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol, dave] = await getUsers(4);
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(dave)
        .deposit(hexETHString, orderAmount.mul(10), {
          value: orderAmount.mul(10),
        });

      for (const [i, user] of [alice, bob, carol].entries()) {
        await expect(
          lendingMarketController
            .connect(user)
            .depositAndCreateOrder(
              hexETHString,
              maturities[0],
              Side.LEND,
              orderAmount,
              8000 + i,
              {
                value: orderAmount,
              },
            ),
        ).to.emit(lendingMarkets[0], 'MakeOrder');
      }

      await expect(
        lendingMarketController
          .connect(dave)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            orderAmount.mul(3),
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      // Check present value
      const daveActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[0],
        dave.address,
      );

      const midUnitPrice = await lendingMarkets[0].getMidUnitPrice();
      const davePV = await lendingMarketController.getTotalPresentValue(
        hexETHString,
        dave.address,
      );

      expect(davePV.sub(daveActualFV.mul(midUnitPrice).div(BP)).abs()).lte(1);
    });

    it('Check future values', async () => {
      const checkFutureValue = async () => {
        for (const { address } of [alice, bob, carol]) {
          await lendingMarketController.cleanOrders(hexETHString, address);
        }

        const [
          aliceFVAmount,
          bobFVAmount,
          carolFVAmount,
          daveFVAmount,
          reserveFundFVAmount,
        ] = await Promise.all(
          [alice, bob, carol, dave, reserveFund].map(({ address }) =>
            futureValueVaults[0].getFutureValue(address),
          ),
        ).then((results) => results.map(({ futureValue }) => futureValue));

        expect(
          aliceFVAmount
            .add(bobFVAmount)
            .add(carolFVAmount)
            .add(reserveFundFVAmount)
            .abs(),
        ).to.equal(daveFVAmount.abs());
      };

      await checkFutureValue();
    });

    it('Execute auto-roll, Check genesis values', async () => {
      const reserveFundGVAmountBefore = await genesisValueVault.getGenesisValue(
        hexETHString,
        reserveFund.address,
      );

      // Auto-roll
      await createSampleETHOrders(owner, maturities[1], '8000');
      await time.increaseTo(maturities[0].toString());
      await lendingMarketController
        .connect(owner)
        .rotateLendingMarkets(hexETHString);

      for (const { address } of [alice, bob, carol, dave, reserveFund]) {
        await lendingMarketController.cleanOrders(hexETHString, address);
      }

      const [
        aliceGVAmount,
        bobGVAmount,
        carolGVAmount,
        daveGVAmount,
        reserveFundGVAmount,
      ] = await Promise.all(
        [alice, bob, carol, dave, reserveFund].map(({ address }) =>
          genesisValueVault.getGenesisValue(hexETHString, address),
        ),
      );

      expect(
        aliceGVAmount
          .add(bobGVAmount)
          .add(carolGVAmount)
          .add(reserveFundGVAmount.sub(reserveFundGVAmountBefore))
          .abs(),
      ).to.equal(daveGVAmount.abs());
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
      await tokenVault.connect(bob).deposit(hexETHString, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexETHString,
            maturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            orderAmount,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      // Check future value
      const aliceActualFV = await lendingMarketController.getFutureValue(
        hexETHString,
        maturities[0],
        alice.address,
      );

      expect(aliceActualFV).to.equal('125000000000000000');
    });

    it('Advance time', async () => {
      const alicePV0Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );

      await time.increaseTo(maturities[0].toString());
      const alicePV0After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1After = await lendingMarketController.getPresentValue(
        hexETHString,
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
          .depositAndCreateOrder(
            hexETHString,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.be.revertedWith('Market is not opened');
    });

    it(`Execute auto-roll`, async () => {
      const alicePV0Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1Before = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );
      const midUnitPrice0 = await lendingMarkets[0].getMidUnitPrice();

      // Auto-roll
      await createSampleETHOrders(carol, maturities[1], '8000');
      await time.increaseTo(maturities[1].toString());
      await lendingMarketController
        .connect(owner)
        .rotateLendingMarkets(hexETHString);

      // Check present value
      const aliceTotalPVAfter =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          alice.address,
        );
      const alicePV0After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[0],
        alice.address,
      );
      const alicePV1After = await lendingMarketController.getPresentValue(
        hexETHString,
        maturities[1],
        alice.address,
      );

      const aliceTotalPV = alicePV0Before
        .mul('10000')
        .div(midUnitPrice0)
        .add(alicePV1Before);

      expect(alicePV0After).to.equal('0');
      expect(alicePV1After).to.equal(aliceTotalPVAfter);
      expect(aliceTotalPVAfter.sub(aliceTotalPV).abs()).lte(1);
    });
  });
});
