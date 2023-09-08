import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH } from '../../utils/strings';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Itayose', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let ellen: SignerWithAddress;

  let lendingMarketOperationLogic: Contract;

  let futureValueVault: Contract;
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
      .executeOrder(
        hexETH,
        maturity,
        Side.BORROW,
        '1000000',
        BigNumber.from(unitPrice).add('1000'),
      );

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexETH,
        maturity,
        Side.LEND,
        '1000000',
        BigNumber.from(unitPrice).sub('1000'),
      );
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
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
      lendingMarketOperationLogic,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, true);

    // Deploy active Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(hexETH, genesisDate);
    }

    maturities = await lendingMarketController.getMaturities(hexETH);

    // Deploy inactive Lending Markets for Itayose
    await lendingMarketController.createOrderBook(hexETH, maturities[0]);
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

      // Check future value
      const { balance: aliceFVBefore } = await futureValueVault.getBalance(
        orderBookIds[0],
        alice.address,
      );
      const { balance: bobFV } = await futureValueVault.getBalance(
        orderBookIds[0],
        bob.address,
      );

      expect(aliceFVBefore).to.equal('0');
      expect(bobFV).not.to.equal('0');
    });

    it('Execute auto-roll', async () => {
      await lendingMarketController
        .connect(carol)
        .depositAndExecuteOrder(
          hexETH,
          maturities[1],
          Side.LEND,
          orderAmount.mul(2),
          8300,
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
          8300,
        );

      // Auto-roll
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateOrderBooks(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');
    });

    it('Execute Itayose without pre-order', async () => {
      const orderBookId = orderBookIds[orderBookIds.length - 1];

      expect(await lendingMarket.isOpened(orderBookId)).to.false;

      // Itayose
      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
      const marketInfo = await lendingMarket.getOrderBookDetail(orderBookId);

      expect(await lendingMarket.isOpened(orderBookId)).to.true;
      expect(marketInfo.openingDate).to.equal(maturities[0]);
      expect(marketInfo.borrowUnitPrice).to.equal('10000');
      expect(marketInfo.lendUnitPrice).to.equal('0');
      expect(marketInfo.marketUnitPrice).to.equal('0');
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

      // Check future value
      const { balance: aliceFVBefore } = await futureValueVault.getBalance(
        orderBookIds[0],
        alice.address,
      );
      const { balance: bobFV } = await futureValueVault.getBalance(
        orderBookIds[0],
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
        .depositAndExecutesPreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount,
          7200,
          { value: orderAmount },
        );

      await lendingMarketController
        .connect(dave)
        .depositAndExecutesPreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount.div(2),
          7400,
          { value: orderAmount.div(2) },
        );

      await lendingMarketController
        .connect(ellen)
        .executePreOrder(hexETH, maturity, Side.BORROW, orderAmount, 7300);

      await lendingMarketController
        .connect(ellen)
        .executePreOrder(hexETH, maturity, Side.BORROW, orderAmount, 7500);
    });

    it('Execute auto-roll', async () => {
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

      // Auto-roll
      await createSampleETHOrders(owner, maturities[1], '8000');
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateOrderBooks(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');
    });

    it('Execute Itayose with pre-order', async () => {
      const orderBookId = orderBookIds[orderBookIds.length - 1];
      expect(await lendingMarket.isOpened(orderBookId)).to.false;

      // Itayose
      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
      const marketInfo = await lendingMarket.getOrderBookDetail(orderBookId);
      const { openingUnitPrice } = await lendingMarket.getItayoseLog(
        maturities[maturities.length - 1],
      );

      expect(await lendingMarket.isOpened(orderBookId)).to.true;
      expect(marketInfo.openingDate).to.equal(maturities[0]);
      expect(marketInfo.borrowUnitPrice).to.equal('7300');
      expect(marketInfo.lendUnitPrice).to.equal('7200');
      expect(marketInfo.marketUnitPrice).to.equal('7300');
      expect(openingUnitPrice).to.equal('7300');
      expect(marketInfo.openingUnitPrice).to.equal('7300');
    });
  });

  describe('Execute Itayose with pre-order and execute clearing order process', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob] = await getUsers(5);
      await resetContractInstances();
    });

    it('Crate pre-orders', async () => {
      // Move to 7 days before maturity.
      await time.increaseTo(maturities[0].sub('604800').toString());

      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(4), {
        value: orderAmount.mul(4),
      });

      const maturity = maturities[maturities.length - 1];

      await lendingMarketController
        .connect(alice)
        .depositAndExecutesPreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount.div(2),
          7400,
          { value: orderAmount.div(2) },
        );

      await lendingMarketController
        .connect(bob)
        .executePreOrder(hexETH, maturity, Side.BORROW, orderAmount, 7300);

      // Auto-roll
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateOrderBooks(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
    });

    it('Check if clearing order process takes the opening price into accounts', async () => {
      const [{ futureValue: aliceFVBefore }, { futureValue: bobFVBefore }] =
        await Promise.all(
          [alice, bob].map((user) =>
            lendingMarketController.getPosition(
              hexETH,
              maturities[maturities.length - 1],
              user.address,
            ),
          ),
        );

      // Inactive order will be cleaned up which affects the future value of alice
      await lendingMarketController
        .connect(alice)
        .depositAndExecuteOrder(
          hexETH,
          maturities[1],
          Side.LEND,
          orderAmount.div(2),
          9000,
          {
            value: orderAmount.div(2),
          },
        );
      await lendingMarketController
        .connect(bob)
        .cleanUpFunds(hexETH, bob.address);

      const [{ futureValue: aliceFVAfter }, { futureValue: bobFVAfter }] =
        await Promise.all(
          [alice, bob].map((user) =>
            lendingMarketController.getPosition(
              hexETH,
              maturities[maturities.length - 1],
              user.address,
            ),
          ),
        );

      expect(aliceFVBefore).to.equal(aliceFVAfter);
      expect(bobFVBefore).to.equal(bobFVAfter);
    });
  });

  describe('Execute Itayose with pre-order in same amount and execute clearing order process', async () => {
    const orderAmount = BigNumber.from('100000000000000000');

    before(async () => {
      [alice, bob] = await getUsers(5);
      await resetContractInstances();
    });

    it('Crate pre-orders', async () => {
      // Move to 7 days before maturity.
      await time.increaseTo(maturities[0].sub('604800').toString());

      await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(4), {
        value: orderAmount.mul(4),
      });

      const maturity = maturities[maturities.length - 1];

      await lendingMarketController
        .connect(alice)
        .depositAndExecutesPreOrder(
          hexETH,
          maturity,
          Side.LEND,
          orderAmount.div(2),
          7400,
          { value: orderAmount.div(2) },
        );

      await lendingMarketController
        .connect(bob)
        .executePreOrder(
          hexETH,
          maturity,
          Side.BORROW,
          orderAmount.div(2),
          7300,
        );

      // Auto-roll
      await time.increaseTo(maturities[0].toString());
      await expect(
        lendingMarketController.connect(owner).rotateOrderBooks(hexETH),
      ).to.emit(lendingMarketOperationLogic, 'OrderBooksRotated');

      await lendingMarketController.executeItayoseCalls(
        [hexETH],
        maturities[maturities.length - 1],
      );
    });

    it('Check if clearing order process takes the opening price into accounts', async () => {
      const [{ futureValue: aliceFVBefore }, { futureValue: bobFVBefore }] =
        await Promise.all(
          [alice, bob].map((user) =>
            lendingMarketController.getPosition(
              hexETH,
              maturities[maturities.length - 1],
              user.address,
            ),
          ),
        );

      // Inactive order will be cleaned up which affects the future value of alice
      await lendingMarketController
        .connect(alice)
        .depositAndExecuteOrder(
          hexETH,
          maturities[1],
          Side.LEND,
          orderAmount.div(2),
          9000,
          {
            value: orderAmount.div(2),
          },
        );
      await lendingMarketController
        .connect(bob)
        .cleanUpFunds(hexETH, bob.address);

      const [{ futureValue: aliceFVAfter }, { futureValue: bobFVAfter }] =
        await Promise.all(
          [alice, bob].map((user) =>
            lendingMarketController.getPosition(
              hexETH,
              maturities[maturities.length - 1],
              user.address,
            ),
          ),
        );

      expect(aliceFVBefore).to.equal(aliceFVAfter);
      expect(bobFVBefore).to.equal(bobFVAfter);
    });
  });
});
