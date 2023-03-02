import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETHString, hexFILString } from '../../utils/strings';
import {
  filToETHRate,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Order Book', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let addressResolver: Contract;
  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;

  let filLendingMarkets: Contract[] = [];
  let filMaturities: BigNumber[];
  let ethMaturities: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
    });

  const createSampleETHOrders = async (user: SignerWithAddress) => {
    await tokenVault
      .connect(user)
      .deposit(hexETHString, initialETHBalance.div(3), {
        value: initialETHBalance.div(3),
      });

    await lendingMarketController
      .connect(user)
      .createOrder(hexETHString, ethMaturities[0], Side.BORROW, '1000', '8200');

    await lendingMarketController
      .connect(user)
      .createOrder(hexETHString, ethMaturities[0], Side.LEND, '1000', '7800');
  };

  const createSampleFILOrders = async (user: SignerWithAddress) => {
    await wFILToken
      .connect(user)
      .approve(tokenVault.address, initialFILBalance);
    await tokenVault.connect(user).deposit(hexFILString, initialFILBalance);
    await tokenVault
      .connect(user)
      .deposit(hexETHString, initialETHBalance.div(3), {
        value: initialETHBalance.div(3),
      });

    await lendingMarketController
      .connect(user)
      .createOrder(hexFILString, filMaturities[0], Side.BORROW, '1000', '8200');

    await lendingMarketController
      .connect(user)
      .createOrder(hexFILString, filMaturities[0], Side.LEND, '1000', '7800');
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      addressResolver,
      currencyController,
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

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexFILString);
      await lendingMarketController.createLendingMarket(hexETHString);
    }

    filLendingMarkets = await lendingMarketController
      .getLendingMarkets(hexFILString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
  });

  describe('Market orders', async () => {
    describe('Add orders using the same currency as the collateral, Fill the order', async () => {
      const orderAmount = initialETHBalance.div(5);
      const depositAmount = orderAmount.mul(3).div(2);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        ethMaturities = await lendingMarketController.getMaturities(
          hexETHString,
        );
        await createSampleETHOrders(carol);
      });

      it('Deposit ETH', async () => {
        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the ETH market', async () => {
        await lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexETHString,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            { value: orderAmount },
          );

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexETHString,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '8000',
          );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController.getFutureValue(
              hexETHString,
              ethMaturities[0],
              address,
            ),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(8))).lte(1);
        expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
      });

      it('Check collateral', async () => {
        const coverage = await tokenVault.getCoverage(alice.address);
        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );
        const bobDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexETHString,
        );

        expect(aliceDepositAmount).to.equal(depositAmount.add(orderAmount));
        expect(bobDepositAmount).to.equal('0');
        expect(coverage.sub('4010').abs()).lte(1);
      });
    });

    describe('Add orders using the different currency as the collateral, Fill the order', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmount = depositAmount
        .mul(4)
        .div(5)
        .mul(BigNumber.from(10).pow(18))
        .div(filToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(
          hexFILString,
        );
        await createSampleFILOrders(carol);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the FIL market', async () => {
        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, initialFILBalance);

        await lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
          );

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController.getFutureValue(
              hexFILString,
              filMaturities[0],
              address,
            ),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(10).div(8))).lte(1);
        expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
      });

      it('Check collateral', async () => {
        const coverage = await tokenVault.getCoverage(alice.address);
        const aliceFILDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexFILString,
        );
        const bobFILDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexFILString,
        );

        expect(aliceFILDepositAmount).to.equal(orderAmount);
        expect(bobFILDepositAmount).to.equal('0');
        expect(coverage.sub('8020').abs()).lte(1);
      });
    });

    describe('Fill orders on multiple markets', async () => {
      const depositAmount = initialETHBalance.div(5);
      const orderAmountInETH = depositAmount.mul(2).div(5);
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(filToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(
          hexFILString,
        );
        ethMaturities = await lendingMarketController.getMaturities(
          hexETHString,
        );
        await createSampleFILOrders(carol);
        await createSampleETHOrders(carol);
      });

      it('Deposit ETH ', async () => {
        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );

        expect(aliceDepositAmount).to.equal(depositAmount);
      });

      it('Fill an order on the FIL market', async () => {
        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, initialFILBalance);

        await lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            orderAmountInFIL,
            '8000',
          );

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '0',
          );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController.getFutureValue(
              hexFILString,
              filMaturities[0],
              address,
            ),
          ),
        );

        const bobTotalCollateralAmountAfter =
          await tokenVault.getTotalCollateralAmount(bob.address);

        expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
        expect(bobFV.sub(orderAmountInFIL.mul(5).div(2))).lte(1);
        expect(bobTotalCollateralAmountAfter.sub(orderAmountInETH.div(2))).lte(
          1,
        );
      });

      it('Fill an order on the ETH market', async () => {
        const orderAmount = orderAmountInETH.div(2);

        await lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexETHString,
            ethMaturities[0],
            Side.LEND,
            orderAmount,
            '8000',
            { value: orderAmount },
          );

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexETHString,
            ethMaturities[0],
            Side.BORROW,
            orderAmount,
            '0',
          );

        const [aliceFV, bobFV] = await Promise.all(
          [alice, bob].map(({ address }) =>
            lendingMarketController.getFutureValue(
              hexETHString,
              ethMaturities[0],
              address,
            ),
          ),
        );

        expect(bobFV.sub(orderAmount.mul(5).div(2))).lte(1);
        expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
      });

      it('Check collateral', async () => {
        const coverage = await tokenVault.getCoverage(alice.address);
        const aliceFILDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexFILString,
        );
        const bobFILDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexFILString,
        );
        const aliceETHDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );
        const bobETHDepositAmount = await tokenVault.getDepositAmount(
          bob.address,
          hexETHString,
        );
        const aliceTotalCollateralAmount =
          await tokenVault.getTotalCollateralAmount(alice.address);
        const bobTotalCollateralAmount =
          await tokenVault.getTotalCollateralAmount(bob.address);

        const filHaircut = await currencyController.getHaircut(hexFILString);
        const ethHaircut = await currencyController.getHaircut(hexETHString);

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
        expect(coverage.sub('5012').abs()).lte(1);
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
      filMaturities = await lendingMarketController.getMaturities(hexFILString);
    });

    afterEach(async () => {
      for (const orderId of orderIds || []) {
        await lendingMarketController
          .connect(orderMaker)
          .cancelOrder(hexFILString, filMaturities[1], orderId);
      }

      orderIds = [];
    });

    for (const input of inputs) {
      describe(`Fill a ${input.label} order with the same amount`, async () => {
        it(`Create users`, async () => {
          [alice, bob] = await getUsers(2);

          await tokenVault
            .connect(bob)
            .deposit(hexETHString, collateralAmount, {
              value: collateralAmount,
            });
        });

        it(`Fill an order`, async () => {
          signer1 = input.signer1 === 'bob' ? bob : alice;
          signer2 = input.signer2 === 'bob' ? bob : alice;

          await wFILToken
            .connect(alice)
            .approve(tokenVault.address, collateralAmount);
          await tokenVault
            .connect(alice)
            .deposit(hexFILString, collateralAmount, {
              value: collateralAmount,
            });

          await expect(
            lendingMarketController
              .connect(signer1)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side1,
                collateralAmount,
                '9001',
              ),
          ).to.emit(filLendingMarkets[1], 'MakeOrder');

          await expect(
            lendingMarketController
              .connect(signer2)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side2,
                collateralAmount,
                '9001',
              ),
          ).to.emit(filLendingMarkets[1], 'TakeOrders');
        });

        it(`Check orders`, async () => {
          const [aliceFV, bobFV] = await Promise.all(
            [alice, bob].map(({ address }) =>
              lendingMarketController.getFutureValue(
                hexFILString,
                filMaturities[1],
                address,
              ),
            ),
          );
          const borrowOrderIds =
            await filLendingMarkets[1].getActiveBorrowOrderIds(bob.address);
          const lendOrderIds = await filLendingMarkets[1].getActiveLendOrderIds(
            alice.address,
          );

          expect(aliceFV.mul(10000).div(bobFV).abs().sub(9950).abs()).to.lte(1);
          expect(borrowOrderIds.length).to.equal(0);
          expect(lendOrderIds.length).to.equal(0);
        });
      });

      describe(`Fill a ${input.label} order with less amount`, async () => {
        it(`Create users`, async () => {
          [alice, bob] = await getUsers(2);

          await tokenVault
            .connect(bob)
            .deposit(hexETHString, collateralAmount, {
              value: collateralAmount,
            });
        });

        it(`Fill an order`, async () => {
          signer1 = input.signer1 === 'bob' ? bob : alice;
          signer2 = input.signer2 === 'bob' ? bob : alice;

          await wFILToken
            .connect(alice)
            .approve(tokenVault.address, collateralAmount);
          await tokenVault
            .connect(alice)
            .deposit(hexFILString, collateralAmount, {
              value: collateralAmount,
            });

          await expect(
            lendingMarketController
              .connect(signer1)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side1,
                collateralAmount,
                '9002',
              ),
          ).to.emit(filLendingMarkets[1], 'MakeOrder');

          await expect(
            lendingMarketController
              .connect(signer2)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side2,
                collateralAmount.div(2),
                '9002',
              ),
          ).to.emit(filLendingMarkets[1], 'TakeOrders');
        });

        it(`Check orders`, async () => {
          const [aliceFV, bobFV] = await Promise.all(
            [alice, bob].map(({ address }) =>
              lendingMarketController.getFutureValue(
                hexFILString,
                filMaturities[1],
                address,
              ),
            ),
          );

          if (input.label === 'lending') {
            orderIds = await filLendingMarkets[1].getActiveLendOrderIds(
              alice.address,
            );
            orderMaker = alice;
          } else {
            orderIds = await filLendingMarkets[1].getActiveBorrowOrderIds(
              bob.address,
            );
            orderMaker = bob;
          }

          expect(aliceFV.mul(10000).div(bobFV).abs().sub(9950).abs()).to.lte(1);
          expect(orderIds.length).to.equal(1);
        });
      });

      describe(`Fill a ${input.label} order with greater amount`, async () => {
        it(`Create users`, async () => {
          [alice, bob] = await getUsers(2);

          await tokenVault
            .connect(bob)
            .deposit(hexETHString, collateralAmount, {
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
            .deposit(hexFILString, collateralAmount.mul(3), {
              value: collateralAmount.mul(3),
            });

          await expect(
            lendingMarketController
              .connect(signer1)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side1,
                collateralAmount.div(2),
                '9003',
              ),
          ).to.emit(filLendingMarkets[1], 'MakeOrder');
          await expect(
            lendingMarketController
              .connect(signer1)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side1,
                collateralAmount.div(2),
                '9003',
              ),
          ).to.emit(filLendingMarkets[1], 'MakeOrder');

          await expect(
            lendingMarketController
              .connect(signer2)
              .createOrder(
                hexFILString,
                filMaturities[1],
                input.side2,
                collateralAmount.mul(2),
                '9003',
              ),
          ).to.emit(filLendingMarkets[1], 'TakeOrders');
        });

        it(`Check orders`, async () => {
          const [aliceFV, bobFV] = await Promise.all(
            [alice, bob].map(({ address }) =>
              lendingMarketController.getFutureValue(
                hexFILString,
                filMaturities[1],
                address,
              ),
            ),
          );

          if (input.label === 'borrowing') {
            orderIds = await filLendingMarkets[1].getActiveLendOrderIds(
              alice.address,
            );
            orderMaker = alice;
          } else {
            orderIds = await filLendingMarkets[1].getActiveBorrowOrderIds(
              bob.address,
            );
            orderMaker = bob;
          }

          expect(aliceFV.mul(10000).div(bobFV).abs().sub(9950).abs()).to.lte(1);
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
        .div(filToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(
          hexFILString,
        );
        await createSampleFILOrders(carol);
      });

      it('Deposit ETH', async () => {
        await tokenVault
          .connect(alice)
          .deposit(hexETHString, depositAmountInETH, {
            value: depositAmountInETH,
          });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );

        expect(aliceDepositAmount).to.equal(depositAmountInETH);
      });

      it('Place a borrowing order on the FIL market', async () => {
        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '8000',
          );

        const aliceFV = await lendingMarketController.getFutureValue(
          hexFILString,
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
        const [orderId] = await filLendingMarkets[0].getActiveBorrowOrderIds(
          alice.address,
        );

        await lendingMarketController
          .connect(alice)
          .cancelOrder(hexFILString, filMaturities[0], orderId);

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
        .div(filToETHRate);

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        filMaturities = await lendingMarketController.getMaturities(
          hexFILString,
        );
        await createSampleFILOrders(carol);
      });

      it('Deposit ETH', async () => {
        await tokenVault
          .connect(alice)
          .deposit(hexETHString, orderAmountInETH, {
            value: orderAmountInETH,
          });

        const aliceDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
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
          hexETHString,
        );

        await lendingMarketController
          .connect(alice)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            orderAmountInFIL,
            '8000',
          );

        const totalCollateralAmountAfter =
          await tokenVault.getTotalCollateralAmount(alice.address);
        const depositAmountAfter = await tokenVault.getDepositAmount(
          alice.address,
          hexETHString,
        );
        const aliceFV = await lendingMarketController.getFutureValue(
          hexFILString,
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
        const [orderId] = await filLendingMarkets[0].getActiveLendOrderIds(
          alice.address,
        );

        await lendingMarketController
          .connect(alice)
          .cancelOrder(hexFILString, filMaturities[0], orderId);

        const filDepositAmount = await tokenVault.getDepositAmount(
          alice.address,
          hexFILString,
        );
        const coverage = await tokenVault.getCoverage(alice.address);

        expect(filDepositAmount).to.equal(orderAmountInFIL);
        expect(coverage).to.equal('0');
      });
    });
  });
});
