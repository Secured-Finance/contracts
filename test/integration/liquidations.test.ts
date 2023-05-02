import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexEFIL, hexETH, hexUSDC } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  eFilToETHRate,
  usdcToETHRate,
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

const ERROR_RANGE = BigNumber.from(1000);

describe('Integration Test: Liquidations', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let signers: Signers;

  let addressResolver: Contract;
  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let reserveFund: Contract;
  let wETHToken: Contract;
  let eFILToken: Contract;
  let usdcToken: Contract;
  let eFilToETHPriceFeed: Contract;
  let usdcToUSDPriceFeed: Contract;

  let fundManagementLogic: Contract;

  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;
  let liquidator: Contract;

  let genesisDate: number;
  let filMaturities: BigNumber[];
  let usdcMaturities: BigNumber[];

  let liquidatorFeeRate: BigNumber;
  let liquidationProtocolFeeRate: BigNumber;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialFILBalance = BigNumber.from('1000000000000000000000');
  const initialUSDCBalance = BigNumber.from('1000000000000000');

  class LendingInfo {
    private address: string;
    private log: Record<string, any> = {};

    constructor(address: string) {
      this.address = address;
    }

    async load(label: string, maturities: Record<string, BigNumber>) {
      const getCcy = (key: string) => {
        switch (key) {
          case 'USDC':
            return hexUSDC;
          case 'EFIL':
            return hexEFIL;
          default:
            return hexETH;
        }
      };

      const [coverage, filDeposit, ethDeposit, usdcDeposit, ...pvs] =
        await Promise.all([
          tokenVault.getCoverage(this.address),
          tokenVault.getDepositAmount(this.address, hexEFIL),
          tokenVault.getDepositAmount(this.address, hexETH),
          tokenVault.getDepositAmount(this.address, hexUSDC),
          ...Object.entries(maturities).map(([key, maturity]) =>
            lendingMarketController.getPresentValue(
              getCcy(key),
              maturity,
              this.address,
            ),
          ),
        ]);

      this.log[label] = {
        Coverage: coverage.toString(),
        ...Object.entries(maturities).reduce((obj, [key, maturity]) => {
          obj[`Maturity(${key})`] = maturity.toNumber();
          return obj;
        }, {}),
        ...Object.keys(maturities).reduce((obj, key, idx) => {
          obj[`PV(${key})`] = pvs[idx].toString();
          return obj;
        }, {}),
        'Deposit(EFIL)': filDeposit.toString(),
        'Deposit(ETH)': ethDeposit.toString(),
        'Deposit(USDC)': usdcDeposit.toString(),
      };
      return { coverage, pvs, filDeposit, ethDeposit };
    }

    show() {
      console.table(this.log);
    }
  }

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      if (owner) {
        await eFILToken
          .connect(owner)
          .transfer(signer.address, initialFILBalance);
        await usdcToken
          .connect(owner)
          .transfer(signer.address, initialUSDCBalance);
      }
      await eFILToken
        .connect(signer)
        .approve(tokenVault.address, ethers.constants.MaxUint256);
      await usdcToken
        .connect(signer)
        .approve(tokenVault.address, ethers.constants.MaxUint256);
    });

  const rotateAllMarkets = async () => {
    await time.increaseTo(usdcMaturities[0].sub('21600').toString());

    await lendingMarketController
      .connect(owner)
      .createOrder(hexEFIL, filMaturities[1], Side.BORROW, '100000000', '8000');

    await lendingMarketController
      .connect(owner)
      .depositAndCreateOrder(
        hexEFIL,
        filMaturities[1],
        Side.LEND,
        '100000000',
        '8000',
      );

    await lendingMarketController
      .connect(owner)
      .createOrder(hexUSDC, usdcMaturities[1], Side.BORROW, '100000', '8000');

    await lendingMarketController
      .connect(owner)
      .depositAndCreateOrder(
        hexUSDC,
        usdcMaturities[1],
        Side.LEND,
        '100000',
        '8000',
      );

    await time.increaseTo(usdcMaturities[0].toString());

    await lendingMarketController.connect(owner).rotateLendingMarkets(hexEFIL);
    await lendingMarketController.connect(owner).rotateLendingMarkets(hexUSDC);

    await lendingMarketController
      .connect(owner)
      .executeItayoseCalls(
        [hexEFIL, hexUSDC],
        usdcMaturities[usdcMaturities.length - 1],
      );
  };

  const resetContractInstances = async () => {
    filMaturities = await lendingMarketController.getMaturities(hexEFIL);
    usdcMaturities = await lendingMarketController.getMaturities(hexUSDC);

    await rotateAllMarkets();

    filMaturities = await lendingMarketController.getMaturities(hexEFIL);
    usdcMaturities = await lendingMarketController.getMaturities(hexUSDC);

    await eFilToETHPriceFeed.updateAnswer(eFilToETHRate);
    await usdcToUSDPriceFeed.updateAnswer(usdcToETHRate);
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());

    ({
      genesisDate,
      fundManagementLogic,
      addressResolver,
      currencyController,
      tokenVault,
      lendingMarketController,
      reserveFund,
      wETHToken,
      eFILToken,
      usdcToken,
      eFilToETHPriceFeed,
      usdcToUSDPriceFeed,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexEFIL, eFILToken.address, false);
    await tokenVault.registerCurrency(hexUSDC, usdcToken.address, false);

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

    await mockUniswapRouter.setToken(hexETH, wETHToken.address);
    await mockUniswapRouter.setToken(hexEFIL, eFILToken.address);
    await mockUniswapRouter.setToken(hexUSDC, usdcToken.address);
    await mockUniswapQuoter.setToken(hexETH, wETHToken.address);
    await mockUniswapQuoter.setToken(hexEFIL, eFILToken.address);
    await mockUniswapQuoter.setToken(hexUSDC, usdcToken.address);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexEFIL, false);
    await tokenVault.updateCurrency(hexUSDC, true);

    [owner] = await getUsers(1);

    await eFILToken
      .connect(owner)
      .transfer(mockUniswapRouter.address, initialFILBalance);
    await usdcToken
      .connect(owner)
      .transfer(mockUniswapRouter.address, initialUSDCBalance);
    await owner.sendTransaction({
      to: mockUniswapRouter.address,
      value: initialETHBalance,
    });

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexEFIL, genesisDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createLendingMarket(hexUSDC, genesisDate)
        .then((tx) => tx.wait());
    }

    await tokenVault.connect(owner).deposit(hexETH, '1000000000000000000000', {
      value: '1000000000000000000000',
    });

    ({ liquidatorFeeRate, liquidationProtocolFeeRate } =
      await tokenVault.getCollateralParameters());
  });

  beforeEach(async () => {
    liquidator = await ethers
      .getContractFactory('Liquidator')
      .then((factory) =>
        factory.deploy(
          lendingMarketController.address,
          tokenVault.address,
          mockUniswapRouter.address,
          mockUniswapQuoter.address,
        ),
      );
  });

  describe('Liquidations on FIL market by ETH', async () => {
    describe('Take an order from the order book, Increase FIL exchange rate by 10%, Liquidate it once, Manage reserve funds', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');
      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();
      });

      // beforeEach(async () => {
      //   if ((await reserveFund.isPaused()) == true) {
      //     await reserveFund.unpause();
      //   }
      // });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await eFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexEFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketController.address),
          'OrderFilled',
        );

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexEFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexEFIL, '200000000000000000000');

        const aliceBalanceAfter = await eFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute liquidation', async () => {
        await eFilToETHPriceFeed.updateAnswer(
          eFilToETHRate.mul('110').div('100'),
        );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          EFIL: filMaturities[0],
        });
        const reserveFundDepositBefore = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexETH,
        );

        await reserveFund.pause();

        const receipt = await liquidator
          .connect(carol)
          .executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[0],
            alice.address,
            10,
          )
          .then(async (tx) => {
            await expect(tx).to.emit(
              lendingMarketController,
              'LiquidationExecuted',
            );
            return tx.wait();
          });

        await reserveFund.unpause();

        const { receivedDebtAmount } = receipt.events.find(
          ({ event }) => event === 'OperationExecute',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          EFIL: filMaturities[0],
        });
        lendingInfo.show();

        // Check the lending info
        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          lendingInfoAfter.pvs[0].sub(lendingInfoBefore.pvs[0].div(2)).abs(),
        ).to.lt(ERROR_RANGE);

        await expect(
          liquidator
            .connect(carol)
            .executeLiquidationCall(
              hexETH,
              hexEFIL,
              filMaturities[0],
              alice.address,
              10,
            ),
        ).to.be.revertedWith('User has enough collateral');

        const [
          liquidatorBalanceETH,
          liquidatorBalanceEFIL,
          reserveFundDepositETHAfter,
          reserveFundDepositEFILAfter,
        ] = await Promise.all(
          [liquidator, reserveFund]
            .map(({ address }) => [
              tokenVault.getDepositAmount(address, hexETH),
              tokenVault.getDepositAmount(address, hexEFIL),
            ])
            .flat(),
        );
        const protocolFeeETH = reserveFundDepositETHAfter.sub(
          reserveFundDepositBefore,
        );

        const protocolFeeEFIL = await currencyController[
          'convert(bytes32,bytes32,uint256)'
        ](hexETH, hexEFIL, protocolFeeETH);

        expect(liquidatorBalanceETH).to.equal(0);
        expect(reserveFundDepositEFILAfter).to.equal(0);

        // Check fees
        const liquidationAmountWithFee = receivedDebtAmount
          .mul(
            ethers.BigNumber.from('10000')
              .add(liquidatorFeeRate)
              .add(liquidationProtocolFeeRate),
          )
          .div('10000');

        expect(
          liquidationAmountWithFee
            .sub(liquidatorBalanceEFIL.add(protocolFeeEFIL))
            .abs(),
        ).lte(1);

        // Withdraw from the reserve funds
        await expect(
          reserveFund.connect(owner).withdraw(hexETH, protocolFeeETH),
        ).to.emit(tokenVault, 'Withdraw');

        const reserveFundsAmountAfterWithdrawal =
          await tokenVault.getDepositAmount(reserveFund.address, hexETH);
        expect(reserveFundsAmountAfterWithdrawal).to.equal('0');

        // Deposit to the reserve funds
        await eFILToken.connect(owner).approve(reserveFund.address, '1000');
        await expect(
          reserveFund.connect(owner).deposit(hexEFIL, '1000'),
        ).to.emit(tokenVault, 'Deposit');

        const reserveFundsAmountAfterDeposit =
          await tokenVault.getDepositAmount(reserveFund.address, hexEFIL);
        expect(reserveFundsAmountAfterDeposit).to.equal('1000');
      });
    });

    describe('Take an order from the order book, Increase FIL exchange rate by 10%, Liquidate it once without using funds in the reserve fund', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');
      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob] = await getUsers(2);
        await resetContractInstances();
      });

      it('Pause the reserve fund', async () => {
        await reserveFund.pause();
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await eFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            filledOrderAmount,
            '8000',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .createOrder(
              hexEFIL,
              filMaturities[0],
              Side.BORROW,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketController.address),
          'OrderFilled',
        );

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexEFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexEFIL, '200000000000000000000');

        const aliceBalanceAfter = await eFILToken.balanceOf(alice.address);
        expect(
          aliceBalanceAfter
            .sub(aliceInitialBalance)
            .sub(filledOrderAmount)
            .abs(),
        ).to.lt(ERROR_RANGE);
      });

      it('Execute liquidation', async () => {
        await eFilToETHPriceFeed.updateAnswer(
          eFilToETHRate.mul('110').div('100'),
        );

        const rfFutureValueBefore =
          await lendingMarketController.getFutureValue(
            hexEFIL,
            filMaturities[0],
            reserveFund.address,
          );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          EFIL: filMaturities[0],
        });

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const rfFutureValueAfter = await lendingMarketController.getFutureValue(
          hexEFIL,
          filMaturities[0],
          reserveFund.address,
        );

        const lendingInfoAfter = await lendingInfo.load('After', {
          EFIL: filMaturities[0],
        });
        lendingInfo.show();

        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          lendingInfoAfter.pvs[0].sub(lendingInfoBefore.pvs[0].div(2)).abs(),
        ).to.lt(ERROR_RANGE);
        expect(rfFutureValueBefore).to.equal(rfFutureValueAfter);
      });

      it('Unpause the reserve fund', async () => {
        await reserveFund.unpause();
      });
    });

    describe('Increase FIL exchange rate by 15%, Liquidate it twice', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');
      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob] = await getUsers(2);
        await resetContractInstances();
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await eFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );
        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexEFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketController.address),
          'OrderFilled',
        );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            filledOrderAmount,
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexEFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexEFIL, '200000000000000000000');

        const aliceBalanceAfter = await eFILToken.balanceOf(alice.address);
        expect(
          aliceBalanceAfter
            .sub(aliceInitialBalance)
            .sub(filledOrderAmount)
            .abs(),
        ).to.lt(ERROR_RANGE);
      });

      it('Execute liquidation twice', async () => {
        await eFilToETHPriceFeed.updateAnswer(
          eFilToETHRate.mul('115').div('100'),
        );

        const rfFutureValueBefore =
          await lendingMarketController.getFutureValue(
            hexEFIL,
            filMaturities[0],
            reserveFund.address,
          );
        const lendingInfoBefore = await lendingInfo.load('Before', {
          EFIL: filMaturities[0],
        });

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const rfFutureValueAfter = await lendingMarketController.getFutureValue(
          hexEFIL,
          filMaturities[0],
          reserveFund.address,
        );
        const tokenVaultBalanceAfter = await wETHToken.balanceOf(
          tokenVault.address,
        );
        const lendingInfoAfter1 = await lendingInfo.load('After1', {
          EFIL: filMaturities[0],
        });

        expect(rfFutureValueAfter.lt(rfFutureValueBefore));
        expect(rfFutureValueAfter.gte(0));

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const tokenVaultBalanceAfter2 = await wETHToken.balanceOf(
          tokenVault.address,
        );
        const lendingInfoAfter2 = await lendingInfo.load('After2', {
          EFIL: filMaturities[0],
        });

        lendingInfo.show();

        expect(tokenVaultBalanceAfter2.lt(tokenVaultBalanceAfter));
        expect(tokenVaultBalanceAfter2.gte(0));
        expect(lendingInfoAfter1.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(lendingInfoAfter2.coverage.lt(lendingInfoAfter1.coverage)).to
          .true;
        expect(
          lendingInfoAfter1.pvs[0].sub(lendingInfoBefore.pvs[0].div(2)).abs(),
        ).to.lt(ERROR_RANGE);
        expect(
          lendingInfoAfter2.pvs[0].sub(lendingInfoAfter1.pvs[0].div(2)).abs(),
        ).to.lt(ERROR_RANGE);

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.be.revertedWith('User has enough collateral');
      });
    });

    describe('Execute auto-roll a borrowing position by 25% rate, Liquidate it using the genesis value in the reserve fund for the offset', async () => {
      const filledOrderAmount = BigNumber.from('180000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');
      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob] = await getUsers(2);
        await resetContractInstances();
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await eFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );
        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexEFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketController.address),
          'OrderFilled',
        );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexEFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexEFIL, '200000000000000000000');

        const aliceBalanceAfter = await eFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute auto-roll', async () => {
        await rotateAllMarkets();
      });

      it('Execute liquidation', async () => {
        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[1],
            Side.BORROW,
            '1000000000',
            '8001',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[1],
            Side.LEND,
            '1000000000',
            '7999',
          );

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[1],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          EFIL: filMaturities[1],
        });

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[1],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const lendingInfoAfter = await lendingInfo.load('After', {
          EFIL: filMaturities[1],
        });
        lendingInfo.show();

        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          lendingInfoAfter.pvs[0].sub(lendingInfoBefore.pvs[0].div(2)).abs(),
        ).to.lt(ERROR_RANGE);
      });
    });

    describe('Liquidate partially due to insufficient collateral', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');
      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await eFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexEFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(
          fundManagementLogic.attach(lendingMarketController.address),
          'OrderFilled',
        );

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexEFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexEFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexEFIL, '200000000000000000000');

        const aliceBalanceAfter = await eFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute liquidation', async () => {
        await eFilToETHPriceFeed.updateAnswer(eFilToETHRate.mul('3'));

        const lendingInfoBefore = await lendingInfo.load('Before', {
          EFIL: filMaturities[0],
        });
        const reserveFundDepositETHBefore = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexETH,
        );

        const receipt = await liquidator
          .connect(carol)
          .executeLiquidationCall(
            hexETH,
            hexEFIL,
            filMaturities[0],
            alice.address,
            10,
          )
          .then((tx) => tx.wait());

        const {
          user,
          collateralCcy,
          debtCcy,
          debtMaturity,
          receivedCollateralAmount,
        } = receipt.events.find(
          ({ event }) => event === 'OperationExecute',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          EFIL: filMaturities[0],
        });
        lendingInfo.show();

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETH);
        expect(debtCcy).to.equal(hexEFIL);
        expect(debtMaturity).to.equal(filMaturities[0]);

        expect(lendingInfoAfter.coverage.gt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          lendingInfoAfter.pvs[0]
            .abs()
            .gt(lendingInfoBefore.pvs[0].div(2).abs()),
        ).to.true;

        // Check fees
        const reserveFundDepositAfter = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexETH,
        );
        const protocolFee = reserveFundDepositAfter.sub(
          reserveFundDepositETHBefore,
        );

        const liquidatorFutureValueAfter =
          await lendingMarketController.getFutureValue(
            hexEFIL,
            filMaturities[0],
            liquidator.address,
          );
        expect(liquidatorFutureValueAfter).to.equal(0);

        expect(receivedCollateralAmount.add(protocolFee)).to.equal(
          depositAmount,
        );
      });
    });
  });

  describe('Liquidations on multiple market', async () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let lendingInfo: LendingInfo;

    const filledOrderAmountInFIL = BigNumber.from('200000000000000000000');
    const filledOrderAmountInUSDC = BigNumber.from('600000000');
    const depositAmountInETH = BigNumber.from('1500000000000000000');

    beforeEach(async () => {
      [alice, bob] = await getUsers(2);
      await resetContractInstances();
      lendingInfo = new LendingInfo(alice.address);

      const aliceFILBalanceBefore = await eFILToken.balanceOf(alice.address);
      const aliceUSDCBalanceBefore = await usdcToken.balanceOf(alice.address);

      await tokenVault.connect(alice).deposit(hexETH, depositAmountInETH, {
        value: depositAmountInETH,
      });

      await tokenVault
        .connect(owner)
        .deposit(hexETH, depositAmountInETH.mul(5), {
          value: depositAmountInETH.mul(5),
        });

      // Create order on FIL market
      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexEFIL,
          filMaturities[0],
          Side.BORROW,
          filledOrderAmountInFIL,
          '8000',
        );

      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexEFIL,
          filMaturities[0],
          Side.BORROW,
          filledOrderAmountInFIL.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexEFIL,
            filMaturities[0],
            Side.LEND,
            filledOrderAmountInFIL,
            '0',
          ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketController.address),
        'OrderFilled',
      );

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexEFIL,
          filMaturities[0],
          Side.LEND,
          '10000000000000000000',
          '7999',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexEFIL),
      ).to.equal(filledOrderAmountInFIL);

      await tokenVault.connect(alice).withdraw(hexEFIL, filledOrderAmountInFIL);

      const aliceFILBalanceAfter = await eFILToken.balanceOf(alice.address);
      expect(aliceFILBalanceAfter.sub(aliceFILBalanceBefore)).to.equal(
        filledOrderAmountInFIL,
      );

      // Create order on USDC market
      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.BORROW,
          filledOrderAmountInUSDC,
          '8000',
        );
      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.BORROW,
          filledOrderAmountInUSDC.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexUSDC,
            usdcMaturities[0],
            Side.LEND,
            filledOrderAmountInUSDC,
            '0',
          ),
      ).to.emit(
        fundManagementLogic.attach(lendingMarketController.address),
        'OrderFilled',
      );

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.LEND,
          '10000000000000',
          '7999',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexUSDC),
      ).to.equal(filledOrderAmountInUSDC);

      await tokenVault
        .connect(alice)
        .withdraw(hexUSDC, filledOrderAmountInUSDC);

      const aliceUSDCBalanceAfter = await usdcToken.balanceOf(alice.address);
      expect(aliceUSDCBalanceAfter.sub(aliceUSDCBalanceBefore)).to.equal(
        filledOrderAmountInUSDC,
      );
    });

    it('Take orders from both FIL & USDC markets, Liquidate the larger position', async () => {
      await lendingInfo.load('Before1', {
        EFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await eFilToETHPriceFeed.updateAnswer(
        eFilToETHRate.mul('110').div('100'),
      );

      const lendingInfoBefore = await lendingInfo.load('Before2', {
        EFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await expect(
        liquidator.executeLiquidationCall(
          hexETH,
          hexEFIL,
          usdcMaturities[0],
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'LiquidationExecuted');

      const lendingInfoAfter = await lendingInfo.load('After', {
        EFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });
      lendingInfo.show();

      expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to.true;
      expect(
        lendingInfoBefore.pvs[0]
          .div(2)
          .abs()
          .gte(lendingInfoAfter.pvs[0].abs()),
      ).to.true;
      expect(lendingInfoAfter.pvs[1]).to.equal(lendingInfoBefore.pvs[1]);
    });

    it('Take orders from both FIL & USDC markets, Liquidate the smaller position', async () => {
      await lendingInfo.load('Before1', {
        EFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await eFilToETHPriceFeed.updateAnswer(
        eFilToETHRate.mul('110').div('100'),
      );

      const lendingInfoBefore = await lendingInfo.load('Before2', {
        EFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await expect(
        liquidator.executeLiquidationCall(
          hexETH,
          hexUSDC,
          usdcMaturities[0],
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'LiquidationExecuted');

      const lendingInfoAfter = await lendingInfo.load('After', {
        EFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });
      lendingInfo.show();

      expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to.true;
      expect(lendingInfoAfter.pvs[0]).to.equal(lendingInfoBefore.pvs[0]);
      expect(lendingInfoAfter.pvs[0].sub(lendingInfoBefore.pvs[0]).abs()).to.lt(
        ERROR_RANGE,
      );
    });
  });
});
