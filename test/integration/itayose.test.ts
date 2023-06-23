import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import { deployContracts } from '../common/deployment';
import { calculateFutureValue } from '../common/orders';
import { Signers } from '../common/signers';

describe('Integration Test: Itayose', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;

  let lendingMarketOperationLogic: Contract;

  let futureValueVaults: Contract[];
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let lendingMarkets: Contract[] = [];
  let wETHToken: Contract;
  let eFILToken: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  let signers: Signers;

  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await eFILToken
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
      .createOrder(
        hexETH,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).add('1000'),
      );

    await lendingMarketController
      .connect(user)
      .createOrder(
        hexETH,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).sub('1000'),
      );
  };

  const resetContractInstances = async () => {
    maturities = await lendingMarketController.getMaturities(hexETH);
    [lendingMarkets, futureValueVaults] = await Promise.all([
      lendingMarketController
        .getLendingMarkets(hexETH)
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
            .getFutureValueVault(hexETH, maturity)
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
      genesisDate,
      tokenVault,
      lendingMarketController,
      wETHToken,
      eFILToken,
      lendingMarketOperationLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, true);

    // Deploy active Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexETH, genesisDate);
    }

    maturities = await lendingMarketController.getMaturities(hexETH);

    // Deploy inactive Lending Markets for Itayose
    await lendingMarketController.createLendingMarket(hexETH, maturities[0]);
  });

  describe('Execute Itayose on the single market without pre-order', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      await resetContractInstances();
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
          .depositAndCreateOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[0], 'OrderMade');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(lendingMarkets[0], 'OrdersTaken');

      // Check future value
      const { futureValue: aliceFVBefore } =
        await futureValueVaults[0].getFutureValue(alice.address);
      const { futureValue: bobFV } = await futureValueVaults[0].getFutureValue(
        bob.address,
      );

      expect(aliceFVBefore).to.equal('0');
      expect(bobFV).not.to.equal('0');
    });

    it('Execute auto-roll', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndCreateOrder(
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
        .createOrder(
          hexETH,
          maturities[1],
          Side.BORROW,
          orderAmount.mul(2),
          8510,
        );

      // Auto-roll
      await createSampleETHOrders(owner, maturities[1], '8000');
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateLendingMarkets(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'LendingMarketsRotated');
    });

    it('Execute Itayose without pre-order', async () => {
      const lendingMarket = lendingMarkets[lendingMarkets.length - 1];
      expect(await lendingMarket.isOpened()).to.false;

      // Itayose
      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
      const marketInfo = await lendingMarket.getMarket();

      expect(await lendingMarket.isOpened()).to.true;
      expect(marketInfo.openingDate).to.equal(maturities[0]);
      expect(marketInfo.borrowUnitPrice).to.equal('10000');
      expect(marketInfo.lendUnitPrice).to.equal('0');
      expect(marketInfo.midUnitPrice).to.equal('5000');
      expect(marketInfo.openingUnitPrice).to.equal('5000');
    });
  });

  describe('Execute Itayose with pre-order', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob, carol, dave, ellen] = await getUsers(5);
      await resetContractInstances();
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
          .depositAndCreateOrder(
            hexETH,
            maturities[0],
            Side.LEND,
            orderAmount,
            8000,
            {
              value: orderAmount,
            },
          ),
      ).to.emit(lendingMarkets[0], 'OrderMade');

      await expect(
        lendingMarketController
          .connect(bob)
          .createOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
      ).to.emit(lendingMarkets[0], 'OrdersTaken');

      // Check future value
      const { futureValue: aliceFVBefore } =
        await futureValueVaults[0].getFutureValue(alice.address);
      const { futureValue: bobFV } = await futureValueVaults[0].getFutureValue(
        bob.address,
      );

      expect(aliceFVBefore).to.equal('0');
      expect(bobFV).not.to.equal('0');
    });

    it('Crate pre-orders', async () => {
      // Move to 7 days before maturity.
      await time.increaseTo(maturities[0].sub('604800').toString());

      await tokenVault.connect(ellen).deposit(hexETH, orderAmount.mul(4), {
        value: orderAmount.mul(4),
      });

      const maturity = maturities[maturities.length - 1];

      await lendingMarketController
        .connect(dave)
        .depositAndCreatePreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount,
          7200,
          { value: orderAmount },
        );

      await lendingMarketController
        .connect(dave)
        .depositAndCreatePreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount.div(2),
          7400,
          { value: orderAmount.div(2) },
        );

      await lendingMarketController
        .connect(ellen)
        .createPreOrder(hexETH, maturity, Side.BORROW, orderAmount, 7300);

      await lendingMarketController
        .connect(ellen)
        .createPreOrder(hexETH, maturity, Side.BORROW, orderAmount, 7500);
    });

    it('Execute auto-roll', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndCreateOrder(
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
        .createOrder(
          hexETH,
          maturities[1],
          Side.BORROW,
          orderAmount.mul(2),
          8510,
        );

      // Auto-roll
      await createSampleETHOrders(owner, maturities[1], '8000');
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateLendingMarkets(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'LendingMarketsRotated');
    });

    it('Execute Itayose with pre-order', async () => {
      const lendingMarket = lendingMarkets[lendingMarkets.length - 1];
      expect(await lendingMarket.isOpened()).to.false;

      // Itayose
      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
      const marketInfo = await lendingMarket.getMarket();
      const openingUnitPrice = await lendingMarket.getOpeningUnitPrice();

      expect(await lendingMarket.isOpened()).to.true;
      expect(marketInfo.openingDate).to.equal(maturities[0]);
      expect(marketInfo.borrowUnitPrice).to.equal('7300');
      expect(marketInfo.lendUnitPrice).to.equal('7200');
      expect(marketInfo.midUnitPrice).to.equal('7250');
      expect(openingUnitPrice).to.equal('7300');
      expect(marketInfo.openingUnitPrice).to.equal('7300');
    });
  });

  describe('Execute Itayose with pre-order and check if clearing order process takes opening unit price into account', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [dave, ellen] = await getUsers(5);
      await resetContractInstances();
    });

    it('Crate pre-orders', async () => {
      // Move to 7 days before maturity.
      await time.increaseTo(maturities[0].sub('604800').toString());

      await tokenVault.connect(ellen).deposit(hexETH, orderAmount.mul(4), {
        value: orderAmount.mul(4),
      });

      const maturity = maturities[maturities.length - 1];

      await lendingMarketController
        .connect(dave)
        .depositAndCreatePreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount.div(2),
          7400,
          { value: orderAmount.div(2) },
        );

      await lendingMarketController
        .connect(ellen)
        .createPreOrder(hexETH, maturity, Side.BORROW, orderAmount, 7300);

      // Auto-roll
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateLendingMarkets(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'LendingMarketsRotated');

      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
    });

    it('Check if clearing order process takes the opening price into accounts', async () => {
      const lendingMarket = lendingMarkets[lendingMarkets.length - 1];
      // Fetch the future value before the clean up process is called
      const { futureValue: daveFVBefore } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[maturities.length - 1],
          dave.address,
        );

      // inactive order will be cleaned up which affects the future value of dave
      await lendingMarketController
        .connect(dave)
        .depositAndCreateOrder(
          hexETH,
          maturities[1],
          Side.LEND,
          orderAmount.div(2),
          9000,
          {
            value: orderAmount.div(2),
          },
        );

      // Fetch the future value after the clean up process was called
      const { futureValue: daveFVAfter } =
        await lendingMarketController.getPosition(
          hexETH,
          maturities[maturities.length - 1],
          dave.address,
        );

      // Fetch the opening unit price decided by Itayose
      const openingUnitPrice = await lendingMarket.getOpeningUnitPrice();
      // The future value of dave should decrease by the pre lending order at the opening unit price
      expect(daveFVBefore.sub(daveFVAfter)).eq(
        calculateFutureValue(orderAmount.div(2), openingUnitPrice),
      );
    });
  });
});
