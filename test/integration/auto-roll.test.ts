import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import {
  deployContracts,
  LIQUIDATION_THRESHOLD_RATE,
} from '../../utils/deployment';
import { Signers } from '../../utils/signers';
import { hexETHString, hexFILString } from '../../utils/strings';

const BP = ethers.BigNumber.from('10000');

describe('Integration Test: Auto-roll', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let addressResolver: Contract;
  let futureValueVaults: Contract[];
  let genesisValueVault: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarkets: Contract[] = [];
  let wETHToken: Contract;
  let wFILToken: Contract;
  let mockSwapRouter: Contract;

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
    await tokenVault.connect(user).deposit(hexETHString, '300000', {
      value: '300000',
    });

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexETHString,
        maturity,
        Side.BORROW,
        '10000',
        BigNumber.from(unitPrice).sub('200'),
      );

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexETHString,
        maturity,
        Side.LEND,
        '10000',
        BigNumber.from(unitPrice).add('200'),
      );
  };

  before('Deploy Contracts', async () => {
    // [owner, alice, bob, carol] = await ethers.getSigners();
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      addressResolver,
      genesisValueVault,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address, false);
    await tokenVault.registerCurrency(hexFILString, wFILToken.address, false);

    mockSwapRouter = await ethers
      .getContractFactory('MockSwapRouter')
      .then((factory) =>
        factory.deploy(addressResolver.address, wETHToken.address),
      );

    await mockSwapRouter.setToken(hexETHString, wETHToken.address);
    await mockSwapRouter.setToken(hexFILString, wFILToken.address);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      mockSwapRouter.address,
    );

    await tokenVault.updateCurrency(hexETHString, true);

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexFILString);
      await lendingMarketController.createLendingMarket(hexETHString);
    }

    maturities = await lendingMarketController.getMaturities(hexETHString);
  });

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexETHString);
    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexETHString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
    futureValueVaults = await Promise.all(
      maturities.map((maturity) =>
        lendingMarketController
          .getFutureValueVault(hexETHString, maturity)
          .then((address) => ethers.getContractAt('FutureValueVault', address)),
      ),
    );
  });

  describe('Rotate the lending markets with orders on the single market', async () => {
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
          .depositAndCreateLendOrderWithETH(hexETHString, maturities[0], 8000, {
            value: orderAmount,
          }),
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
      expect(bobFV).to.equal('-125000000000000000');

      await lendingMarketController.cleanOrders(hexETHString, alice.address);
      const { futureValue: aliceFVAfter } =
        await futureValueVaults[0].getFutureValue(alice.address);

      expect(aliceFVAfter.sub(aliceActualFV).abs()).lte(1);

      // Check present value
      const midUnitPrice = await lendingMarkets[0].getMidUnitPrice();
      const alicePV = await lendingMarketController.getTotalPresentValue(
        hexETHString,
        alice.address,
      );

      expect(alicePV).to.equal(aliceActualFV.mul(midUnitPrice).div(BP));
    });

    it('Rotate the lending markets (1st time)', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndCreateLendOrderWithETH(hexETHString, maturities[1], 8510, {
          value: orderAmount.mul(2),
        });
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
      await time.increaseTo(maturities[0].toString());
      await lendingMarketController
        .connect(owner)
        .rotateLendingMarkets(hexETHString);

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
      ).lte('1');
      expect(aliceTotalPVAfter.add(bobTotalPVAfter)).to.equal('0');

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

    it('Rotate the lending markets (2nd time)', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndCreateLendOrderWithETH(hexETHString, maturities[1], 8100, {
          value: orderAmount.mul(2),
        });
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
      await time.increaseTo(maturities[0].toString());
      await lendingMarketController
        .connect(owner)
        .rotateLendingMarkets(hexETHString);

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
      ).lte('1');
      expect(aliceTotalPVAfter.add(bobTotalPVAfter)).to.equal('0');

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

  describe('Rotate the lending markets with orders on the multiple markets', async () => {
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
          .depositAndCreateLendOrderWithETH(hexETHString, maturities[0], 8000, {
            value: orderAmount,
          }),
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

      expect(aliceActualFV.sub('125000000000000000').abs()).lte(1);
    });

    it('Fill an order on the second closest maturity market', async () => {
      await tokenVault.connect(bob).deposit(hexETHString, orderAmount.mul(2), {
        value: orderAmount.mul(2),
      });

      await expect(
        lendingMarketController
          .connect(alice)
          .depositAndCreateLendOrderWithETH(hexETHString, maturities[1], 5000, {
            value: orderAmount,
          }),
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
      expect(aliceActualFV.add(bobActualFV)).equal('0');
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

      expect(alicePV.sub('200000000000000000').abs()).lte('1');
      expect(alicePV.add(bobPV)).to.equal('0');
    });

    it('Rotate the lending markets (1st time)', async () => {
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

      expect(alicePV0Before.sub(orderAmount)).lte('2');
      expect(aliceTotalPVBefore).to.equal(alicePV0Before.add(alicePV1Before));
      expect(aliceTotalPVBefore.add(bobTotalPVBefore)).to.equal('0');

      const midUnitPrice0 = await lendingMarkets[0].getMidUnitPrice();

      // Auto-roll
      await time.increaseTo(maturities[0].toString());
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
      expect(aliceTotalPVAfter.sub(aliceTotalPV).abs()).lte('2');
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
});
