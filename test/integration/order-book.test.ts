import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexWFIL } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PCT_DIGIT,
  wFilToETHRate,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import {
  calculateFutureValue,
  calculateOrderFee,
  getAmountWithOrderFee,
} from '../common/orders';
import { Signers } from '../common/signers';

describe('Integration Test: Order Book', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;

  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;

  let fundManagementLogic: Contract;
  let orderActionLogic: Contract;

  let genesisDate: number;
  let filLendingMarket: Contract;
  let filMaturities: BigNumber[];
  let ethMaturities: BigNumber[];
  let filOrderBookIds: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  const createSampleETHOrders = async (
    user: SignerWithAddress,
    maturityIdx = 0,
  ) => {
    await tokenVault.connect(user).deposit(hexETH, initialETHBalance.div(3), {
      value: initialETHBalance.div(3),
    });

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexETH,
        ethMaturities[maturityIdx],
        Side.BORROW,
        '1000',
        '8200',
      );

    await lendingMarketController
      .connect(user)
      .executeOrder(
        hexETH,
        ethMaturities[maturityIdx],
        Side.LEND,
        '1000',
        '7800',
      );
  };

  const createSampleFILOrders = async (user: SignerWithAddress) => {
    await wFILToken
      .connect(user)
      .approve(tokenVault.address, initialFILBalance);
    await tokenVault.connect(user).deposit(hexWFIL, initialFILBalance);
    await tokenVault.connect(user).deposit(hexETH, initialETHBalance.div(3), {
      value: initialETHBalance.div(3),
    });

    await lendingMarketController
      .connect(user)
      .executeOrder(hexWFIL, filMaturities[0], Side.BORROW, '1000', '8200');

    await lendingMarketController
      .connect(user)
      .executeOrder(hexWFIL, filMaturities[0], Side.LEND, '1000', '7800');
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      fundManagementLogic,
      currencyController,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
      orderActionLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(hexWFIL, genesisDate);
      await lendingMarketController.createOrderBook(hexETH, genesisDate);
    }

    filLendingMarket = await lendingMarketController
      .getLendingMarket(hexWFIL)
      .then((address) => ethers.getContractAt('LendingMarket', address));

    filOrderBookIds = await lendingMarketController.getOrderBookIds(hexWFIL);

    orderActionLogic = orderActionLogic.attach(filLendingMarket.address);
  });

  describe('Market orders', async () => {
    describe('Add orders using the same currency as the collateral, Fill the order, Unwind the ETH borrowing order', async () => {
      const orderAmount = initialETHBalance.div(5);
      const depositAmount = orderAmount.mul(3).div(2);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
        await createSampleETHOrders(carol);
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the ETH market', async () => {
        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            { value: orderAmount },
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '8000',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount,
          '8000',
          ethMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexETH, ethMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(8))).lte(1);
        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
      });

      it('Check collateral', async () => {
        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );
        const bobDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount.add(orderAmount));
        expect(bobDepositAmount).to.equal('0');
      });

      it('Unwind all positions', async () => {
        await lendingMarketController
          .connect(carol)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount.mul(2),
            '8000',
            { value: orderAmount.mul(2) },
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .unwindPosition(hexETH, ethMaturities[0]),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexETH,
            ethMaturities[0],
            alice.address,
          );

        expect(aliceFV).to.equal(0);
      });

      after(async () => {
        const { activeOrders } = await lendingMarketController.getOrders(
          [hexETH],
          carol.address,
        );

        for (const order of activeOrders) {
          await lendingMarketController
            .connect(carol)
            .cancelOrder(hexETH, order.maturity, order.orderId);
        }
      });
    });

    describe('Add orders using the different currency as the collateral, Fill the order, Unwind the non-ETH borrowing order', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount
        .mul(3)
        .div(5)
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol, dave] = await getUsers(4);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
        await createSampleFILOrders(carol);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the FIL market', async () => {
        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, initialFILBalance);

        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount,
          '8000',
          filMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexWFIL, filMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(8))).lte(1);
        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
      });

      it('Check collateral', async () => {
        const aliceFILDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexWFIL,
        );
        const bobFILDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexWFIL,
        );

        expect(aliceFILDepositAmount).to.equal(orderAmount);
        expect(bobFILDepositAmount).to.equal('0');
      });

      it('Unwind all positions', async () => {
        await tokenVault.connect(dave).deposit(hexETH, depositAmount.mul(2), {
          value: depositAmount.mul(2),
        });

        await lendingMarketController
          .connect(dave)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount.mul(2),
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .unwindPosition(hexWFIL, filMaturities[0]),
        ).to.be.revertedWith('NotEnoughDeposit');

        // Deposit the amount that is not enough due to fees being deducted.
        await wFILToken
          .connect(alice)
          .approve(tokenVault.address, orderAmount.div(30));
        await tokenVault.connect(alice).deposit(hexWFIL, orderAmount.div(30));

        await expect(
          lendingMarketController
            .connect(alice)
            .unwindPosition(hexWFIL, filMaturities[0]),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            alice.address,
          );

        expect(aliceFV).to.equal(0);
      });

      after(async () => {
        await lendingMarketController
          .connect(dave)
          .cancelOrder(hexWFIL, filMaturities[0], '4');
      });
    });

    describe('Fill the order, Unwind the lending order', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount
        .mul(3)
        .div(5)
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the FIL market', async () => {
        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, initialFILBalance);

        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount,
          '8000',
          filMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexWFIL, filMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(8))).lte(1);
        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
      });

      it('Check lending position', async () => {
        const { futureValue: bobFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            bob.address,
          );

        expect(bobFV).to.equal(calculateFutureValue(orderAmount, '8000'));
      });

      it('Unwind a lending position', async () => {
        await wFILToken
          .connect(carol)
          .approve(tokenVault.address, orderAmount.mul(2));

        await lendingMarketController
          .connect(carol)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          );

        const tx = await lendingMarketController
          .connect(bob)
          .unwindPosition(hexWFIL, filMaturities[0]);

        await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');

        const { futureValue: bobFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            bob.address,
          );

        expect(bobFV).to.equal(0);

        const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
        const bobFILDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexWFIL,
        );

        expect(
          bobFILDepositAmount
            .sub(
              getAmountWithOrderFee(
                Side.BORROW,
                orderAmount,
                filMaturities[0].sub(timestamp),
              ),
            )
            .abs(1),
        ).to.lte(1);
      });
    });

    describe('Fill orders in multiple markets, Unwind partially', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmountInETH = depositAmount.mul(2).div(5);
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol, dave] = await getUsers(4);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
        await createSampleFILOrders(carol);
        await createSampleETHOrders(carol);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the FIL market', async () => {
        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, initialFILBalance);

        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmountInFIL,
            '8000',
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmountInFIL,
          '8000',
          filMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexWFIL, filMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
        expect(bobFV.sub(orderAmountInFIL.mul(5).div(2))).lte(1);
      });

      it('Fill an order on the ETH market', async () => {
        const orderAmount = orderAmountInETH.div(2);

        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            { value: orderAmount },
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount,
          '8000',
          ethMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexETH, ethMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(5).div(2))).lte(1);
        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
      });

      it('Check collateral', async () => {
        const aliceFILDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexWFIL,
        );
        const bobFILDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexWFIL,
        );
        const aliceETHDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );
        const bobETHDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexETH,
        );
        const aliceTotalCollateralAmount =
          await tokenVault.getTotalCollateralAmount(alice.address);
        const bobTotalCollateralAmount =
          await tokenVault.getTotalCollateralAmount(bob.address);

        const filHaircut = await currencyController.getHaircut(hexWFIL);
        const ethHaircut = await currencyController.getHaircut(hexETH);

        expect(aliceFILDepositAmount).to.equal(orderAmountInFIL);
        expect(aliceETHDepositAmount).to.equal(
          depositAmount.add(orderAmountInETH.div(2)),
        );
        expect(aliceTotalCollateralAmount).to.equal(aliceETHDepositAmount);
        expect(bobFILDepositAmount).to.equal('0');
        expect(bobETHDepositAmount).to.equal('0');
        expect(
          bobTotalCollateralAmount.sub(
            orderAmountInETH
              .mul(filHaircut)
              .add(orderAmountInETH.div(2).mul(ethHaircut))
              .div('10000'),
          ),
        );
      });

      it('Unwind positions partially', async () => {
        const { futureValue: aliceFVBefore } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            alice.address,
          );

        await tokenVault.connect(dave).deposit(hexETH, depositAmount.mul(2), {
          value: depositAmount.mul(2),
        });

        await lendingMarketController
          .connect(dave)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL.div(2),
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .unwindPosition(hexWFIL, filMaturities[0]),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            alice.address,
          );

        expect(aliceFVAfter.abs()).to.lte(aliceFVBefore.abs());
      });
    });

    describe('Fill multiple orders on different order sides in multiple markets', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount.mul(3).div(5);
      const orderAmount2 = orderAmount.mul(4).div(5);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        ethMaturities = await lendingMarketController.getMaturities(hexETH);
        await createSampleETHOrders(carol, 0);
        await createSampleETHOrders(carol, 1);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the ETH market(1)', async () => {
        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            { value: orderAmount },
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexETH,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount,
          '8000',
          ethMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexETH, ethMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
        expect(bobFV.sub(orderAmount.mul(5).div(2))).lte(1);
      });

      it('Fill an order on the ETH market(2)', async () => {
        expect(await tokenVault.getCoverage(bob.address)).to.equal('0');

        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexETH,
            ethMaturities[1],
            Side.BORROW,
            orderAmount2,
            '8000',
          );

        expect(await tokenVault.getCoverage(bob.address)).to.equal('8000');

        const bobFundsBefore = await lendingMarketController.calculateFunds(
          hexETH,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        expect(bobFundsBefore.workingLendOrdersAmount).to.equal(0);
        expect(bobFundsBefore.claimableAmount).to.equal(orderAmount);
        expect(bobFundsBefore.collateralAmount).to.equal(orderAmount);
        expect(bobFundsBefore.workingBorrowOrdersAmount).to.equal(orderAmount2);
        expect(bobFundsBefore.debtAmount).to.equal(0);
        expect(bobFundsBefore.borrowedAmount).to.equal(0);

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexETH,
            ethMaturities[1],
            Side.LEND,
            orderAmount2,
            '0',
            { value: orderAmount2 },
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount2,
          '8000',
          ethMaturities[1].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexETH, ethMaturities[1], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(aliceFV.add(bobFV).add(fee)).to.lte(1);
        expect(bobFV.sub(orderAmount2)).lte(1);

        const bobFundsAfter = await lendingMarketController.calculateFunds(
          hexETH,
          bob.address,
          LIQUIDATION_THRESHOLD_RATE,
        );

        expect(bobFundsAfter.workingLendOrdersAmount).to.equal(0);
        expect(bobFundsAfter.claimableAmount).to.equal(orderAmount);
        expect(bobFundsAfter.collateralAmount).to.equal(orderAmount);
        expect(bobFundsAfter.workingBorrowOrdersAmount).to.equal(0);
        expect(bobFundsAfter.debtAmount).to.equal(orderAmount2);
        expect(bobFundsAfter.borrowedAmount).to.equal(orderAmount2);

        const bobCoverage = orderAmount2
          .mul(PCT_DIGIT)
          .div(calculateFutureValue(orderAmount2, '8000').add(orderAmount2));

        expect(await tokenVault.getCoverage(bob.address)).to.equal(bobCoverage);
      });
    });

    describe('Fill orders, Trigger circuit breakers by one order', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount
        .mul(4)
        .div(5)
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob] = await getUsers(2);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill orders on the FIL market', async () => {
        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount.div(2),
            '8000',
          );

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount.div(2),
            '9001',
          );

        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, initialFILBalance);

        const { blockHash } = await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount.div(2),
          '8000',
          filMaturities[0].sub(timestamp),
        );

        const { futureValue: bobFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            bob.address,
          );

        calculateFutureValue(orderAmount.div(2), 8000);

        expect(
          bobFV.add(fee).sub(calculateFutureValue(orderAmount.div(2), 8000)),
        ).lte(1);
      });
    });

    describe('Fill orders, Trigger circuit breakers by multiple orders', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount
        .mul(4)
        .div(5)
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol, dave] = await getUsers(4);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill orders on the FIL market', async () => {
        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount.div(2),
            '8000',
          );

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount.div(2),
            '8164',
          );

        for (const user of [bob, carol, dave]) {
          await wFILToken
            .connect(user)
            .approve(tokenVault.address, initialFILBalance);
        }

        await ethers.provider.send('evm_setAutomine', [false]);

        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount.div(2),
            '0',
          );

        const tx = await lendingMarketController
          .connect(carol)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount.div(2),
            '0',
          );

        await ethers.provider.send('evm_mine', []);
        await ethers.provider.send('evm_setAutomine', [true]);

        await expect(tx)
          .to.emit(orderActionLogic, 'OrderExecuted')
          .withArgs(
            carol.address,
            Side.LEND,
            hexWFIL,
            filMaturities[0],
            orderAmount.div(2),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            true,
          );

        await expect(
          lendingMarketController
            .connect(dave)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              orderAmount.div(3),
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');
      });
    });

    describe('Unwind lending position used as collateral', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount
        .mul(3)
        .div(5)
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      });

      after(async () => {
        const { activeOrders } = await lendingMarketController.getOrders(
          [hexWFIL],
          carol.address,
        );

        for (const order of activeOrders) {
          await lendingMarketController
            .connect(carol)
            .cancelOrder(hexWFIL, order.maturity, order.orderId);
        }
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the FIL market(1)', async () => {
        await wFILToken.connect(bob).approve(tokenVault.address, orderAmount);

        await lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount,
          '8000',
          filMaturities[0].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexWFIL, filMaturities[0], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(8))).lte(1);
        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
      });

      it('Fill an order on the FIL market(2)', async () => {
        await wFILToken.connect(alice).approve(tokenVault.address, orderAmount);

        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexWFIL,
            filMaturities[1],
            Side.BORROW,
            orderAmount.div(2),
            '8000',
          );

        const { blockHash } = await lendingMarketController
          .connect(alice)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[1],
            Side.LEND,
            orderAmount.div(2),
            '0',
          );

        const { timestamp } = await ethers.provider.getBlock(blockHash);
        const fee = calculateOrderFee(
          orderAmount.div(2),
          '8000',
          filMaturities[1].sub(timestamp),
        );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController
              .getPosition(hexWFIL, filMaturities[1], address)
              .then(({ futureValue }) => futureValue),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(16))).lte(1);
        expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
      });

      it('Fail to unwind positions due to insufficient collateral', async () => {
        await wFILToken.connect(carol).approve(tokenVault.address, orderAmount);

        await lendingMarketController
          .connect(carol)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .unwindPosition(hexWFIL, filMaturities[0]),
        ).to.be.revertedWith('NotEnoughCollateral');
      });
    });
  });

  describe('Limit orders', async () => {
    const collateralAmount = initialETHBalance.div(5);
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let orderIds: number[];
    let orderMaker: SignerWithAddress;

    const inputs = [
      {
        label: 'borrowing',
        side1: Side.BORROW,
        side2: Side.LEND,
        signer1: 'bob',
        signer2: 'alice',
      },
      {
        label: 'lending',
        side1: Side.LEND,
        side2: Side.BORROW,
        signer1: 'alice',
        signer2: 'bob',
      },
    ];

    before(async () => {
      filMaturities = await lendingMarketController.getMaturities(hexWFIL);
    });

    afterEach(async () => {
      for (const orderId of orderIds || []) {
        await lendingMarketController
          .connect(orderMaker)
          .cancelOrder(hexWFIL, filMaturities[1], orderId);
      }

      orderIds = [];
    });

    for (const input of inputs) {
      describe(`Fill a ${input.label} order with the same amount`, async () => {
        let fee: BigNumber;

        it(`Create users`, async () => {
          [alice, bob] = await getUsers(2);

          await tokenVault.connect(bob).deposit(hexETH, collateralAmount, {
            value: collateralAmount,
          });
        });

        it(`Fill an order`, async () => {
          signer1 = input.signer1 === 'bob' ? bob : alice;
          signer2 = input.signer2 === 'bob' ? bob : alice;

          await wFILToken
            .connect(alice)
            .approve(tokenVault.address, collateralAmount);
          await tokenVault.connect(alice).deposit(hexWFIL, collateralAmount, {
            value: collateralAmount,
          });

          await expect(
            lendingMarketController
              .connect(signer1)
              .executeOrder(
                hexWFIL,
                filMaturities[1],
                input.side1,
                collateralAmount,
                '9001',
              ),
          ).to.not.emit(fundManagementLogic, 'OrderFilled');

          const tx = await lendingMarketController
            .connect(signer2)
            .executeOrder(
              hexWFIL,
              filMaturities[1],
              input.side2,
              collateralAmount,
              '9001',
            );

          await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');

          const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
          fee = calculateOrderFee(
            collateralAmount,
            '9001',
            filMaturities[1].sub(timestamp),
          );
        });

        it(`Check orders`, async () => {
          const [aliceFV, bobFV] = await Promise.all(
            [alice, bob].map(({ address }) =>
              lendingMarketController
                .getPosition(hexWFIL, filMaturities[1], address)
                .then(({ futureValue }) => futureValue),
            ),
          );
          const { activeOrderIds: borrowOrderIds } =
            await filLendingMarket.getBorrowOrderIds(
              filOrderBookIds[1],
              bob.address,
            );
          const { activeOrderIds: lendOrderIds } =
            await filLendingMarket.getLendOrderIds(
              filOrderBookIds[1],
              alice.address,
            );

          expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
          expect(borrowOrderIds.length).to.equal(0);
          expect(lendOrderIds.length).to.equal(0);
        });
      });

      describe(`Fill a ${input.label} order with less amount`, async () => {
        let fee: BigNumber;

        it(`Create users`, async () => {
          [alice, bob] = await getUsers(2);

          await tokenVault.connect(bob).deposit(hexETH, collateralAmount, {
            value: collateralAmount,
          });
        });

        it(`Fill an order`, async () => {
          signer1 = input.signer1 === 'bob' ? bob : alice;
          signer2 = input.signer2 === 'bob' ? bob : alice;

          await wFILToken
            .connect(alice)
            .approve(tokenVault.address, collateralAmount);
          await tokenVault.connect(alice).deposit(hexWFIL, collateralAmount, {
            value: collateralAmount,
          });

          await expect(
            lendingMarketController
              .connect(signer1)
              .executeOrder(
                hexWFIL,
                filMaturities[1],
                input.side1,
                collateralAmount,
                '9002',
              ),
          ).to.not.emit(fundManagementLogic, 'OrderFilled');

          const tx = lendingMarketController
            .connect(signer2)
            .executeOrder(
              hexWFIL,
              filMaturities[1],
              input.side2,
              collateralAmount.div(2),
              '9002',
            );

          await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');

          const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
          fee = calculateOrderFee(
            collateralAmount.div(2),
            '9002',
            filMaturities[1].sub(timestamp),
          );
        });

        it(`Check orders`, async () => {
          const [aliceFV, bobFV] = await Promise.all(
            [alice, bob].map(({ address }) =>
              lendingMarketController
                .getPosition(hexWFIL, filMaturities[1], address)
                .then(({ futureValue }) => futureValue),
            ),
          );

          if (input.label === 'lending') {
            ({ activeOrderIds: orderIds } =
              await filLendingMarket.getLendOrderIds(
                filOrderBookIds[1],
                alice.address,
              ));
            orderMaker = alice;
          } else {
            ({ activeOrderIds: orderIds } =
              await filLendingMarket.getBorrowOrderIds(
                filOrderBookIds[1],
                bob.address,
              ));
            orderMaker = bob;
          }

          expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
          expect(orderIds.length).to.equal(1);
        });
      });

      describe(`Fill a ${input.label} order with greater amount`, async () => {
        let fee: BigNumber;

        it(`Create users`, async () => {
          [alice, bob] = await getUsers(2);

          await tokenVault.connect(bob).deposit(hexETH, collateralAmount, {
            value: collateralAmount,
          });
        });

        it(`Fill an order`, async () => {
          signer1 = input.signer1 === 'bob' ? bob : alice;
          signer2 = input.signer2 === 'bob' ? bob : alice;

          await wFILToken
            .connect(alice)
            .approve(tokenVault.address, collateralAmount.mul(3));
          await tokenVault
            .connect(alice)
            .deposit(hexWFIL, collateralAmount.mul(3), {
              value: collateralAmount.mul(3),
            });

          await expect(
            lendingMarketController
              .connect(signer1)
              .executeOrder(
                hexWFIL,
                filMaturities[1],
                input.side1,
                collateralAmount.div(2),
                '9003',
              ),
          ).to.not.emit(fundManagementLogic, 'OrderFilled');
          await expect(
            lendingMarketController
              .connect(signer1)
              .executeOrder(
                hexWFIL,
                filMaturities[1],
                input.side1,
                collateralAmount.div(2),
                '9003',
              ),
          ).to.not.emit(fundManagementLogic, 'OrderFilled');

          const tx = await lendingMarketController
            .connect(signer2)
            .executeOrder(
              hexWFIL,
              filMaturities[1],
              input.side2,
              collateralAmount.mul(2),
              '9003',
            );

          await expect(tx).to.emit(fundManagementLogic, 'OrderFilled');

          const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
          fee = calculateOrderFee(
            collateralAmount,
            '9003',
            filMaturities[1].sub(timestamp),
          );
        });

        it(`Check orders`, async () => {
          const [aliceFV, bobFV] = await Promise.all(
            [alice, bob].map(({ address }) =>
              lendingMarketController
                .getPosition(hexWFIL, filMaturities[1], address)
                .then(({ futureValue }) => futureValue),
            ),
          );

          if (input.label === 'borrowing') {
            ({ activeOrderIds: orderIds } =
              await filLendingMarket.getLendOrderIds(
                filOrderBookIds[1],
                alice.address,
              ));
            orderMaker = alice;
          } else {
            ({ activeOrderIds: orderIds } =
              await filLendingMarket.getBorrowOrderIds(
                filOrderBookIds[1],
                bob.address,
              ));
            orderMaker = bob;
          }

          expect(bobFV.add(aliceFV).add(fee)).to.lte(1);
          expect(orderIds.length).to.equal(1);
        });
      });
    }
  });

  describe('Order Cancellation', async () => {
    describe('Place a borrowing order, Cancel orders', async () => {
      const depositAmountInETH = initialETHBalance.div(5);
      const orderAmountInETH = depositAmountInETH.mul(4).div(5);
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
        await createSampleFILOrders(carol);
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, depositAmountInETH, {
          value: depositAmountInETH,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(depositAmountInETH);
      });

      it('Place a borrowing order on the FIL market', async () => {
        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '8000',
          );

        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            alice.address,
          );
        const unusedCollateral = await tokenVault.getUnusedCollateral(
          alice.address,
        );
        const coverage = await tokenVault.getCoverage(alice.address);

        expect(
          unusedCollateral.sub(depositAmountInETH.sub(orderAmountInETH)),
        ).lte(1);
        expect(aliceFV).to.equal('0');
        expect(coverage.sub('8000').abs()).lte(1);
      });

      it('Cancel an order', async () => {
        const {
          activeOrderIds: [orderId],
        } = await filLendingMarket.getBorrowOrderIds(
          filOrderBookIds[0],
          alice.address,
        );

        await lendingMarketController
          .connect(alice)
          .cancelOrder(hexWFIL, filMaturities[0], orderId);

        const unusedCollateral = await tokenVault.getUnusedCollateral(
          alice.address,
        );
        const coverage = await tokenVault.getCoverage(alice.address);

        expect(unusedCollateral).to.equal(depositAmountInETH);
        expect(coverage).to.equal('0');
      });
    });

    describe('Place a lending order by a user who has a deposit, Cancel orders', async () => {
      const depositAmountInETH = initialETHBalance.div(5);
      const orderAmountInETH = depositAmountInETH.mul(4).div(5);
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(hexWFIL);
        await createSampleFILOrders(carol);
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETH, orderAmountInETH, {
          value: orderAmountInETH,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        expect(aliceDepositAmount).to.equal(orderAmountInETH);
      });

      it('Place a lending order on the FIL market', async () => {
        await wFILToken
          .connect(alice)
          .approve(tokenVault.address, orderAmountInFIL);

        const totalCollateralAmountBefore =
          await tokenVault.getTotalCollateralAmount(alice.address);
        const depositAmountBefore = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              orderAmountInFIL,
              '8000',
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        const totalCollateralAmountAfter =
          await tokenVault.getTotalCollateralAmount(alice.address);
        const depositAmountAfter = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );
        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            alice.address,
          );
        const unusedCollateral = await tokenVault.getUnusedCollateral(
          alice.address,
        );
        const coverage = await tokenVault.getCoverage(alice.address);

        expect(totalCollateralAmountBefore).to.equal(
          totalCollateralAmountAfter,
        );
        expect(depositAmountBefore).to.equal(depositAmountAfter);
        expect(unusedCollateral).to.equal(totalCollateralAmountBefore);
        expect(aliceFV).to.equal('0');
        expect(coverage).to.equal('0');
      });

      it('Cancel an order', async () => {
        const {
          activeOrderIds: [orderId],
        } = await filLendingMarket.getLendOrderIds(
          filOrderBookIds[0],
          alice.address,
        );

        await lendingMarketController
          .connect(alice)
          .cancelOrder(hexWFIL, filMaturities[0], orderId);

        const filDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexWFIL,
        );
        const coverage = await tokenVault.getCoverage(alice.address);

        expect(filDepositAmount).to.equal(orderAmountInFIL);
        expect(coverage).to.equal('0');
      });
    });
  });
});
