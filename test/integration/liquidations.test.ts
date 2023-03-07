import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETHString, hexFILString, hexUSDCString } from '../../utils/strings';
import {
  filToETHRate,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
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
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let reserveFund: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let usdcToken: Contract;
  let filToETHPriceFeed: Contract;
  let usdcToUSDPriceFeed: Contract;

  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;

  let genesisDate: number;
  let filMaturities: BigNumber[];
  let usdcMaturities: BigNumber[];

  let liquidatorFeeRate: BigNumber;
  let liquidationProtocolFeeRate: BigNumber;

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
            return hexUSDCString;
          case 'FIL':
            return hexFILString;
          default:
            return hexETHString;
        }
      };

      const [coverage, filDeposit, ethDeposit, usdcDeposit, ...pvs] =
        await Promise.all([
          tokenVault.getCoverage(this.address),
          tokenVault.getDepositAmount(this.address, hexFILString),
          tokenVault.getDepositAmount(this.address, hexETHString),
          tokenVault.getDepositAmount(this.address, hexUSDCString),
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
        'Deposit(FIL)': filDeposit.toString(),
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
        await wFILToken
          .connect(owner)
          .transfer(signer.address, initialFILBalance);
        await usdcToken
          .connect(owner)
          .transfer(signer.address, initialUSDCBalance);
      }
      await wFILToken
        .connect(signer)
        .approve(tokenVault.address, ethers.constants.MaxUint256);
      await usdcToken
        .connect(signer)
        .approve(tokenVault.address, ethers.constants.MaxUint256);
    });

  const rotateAllMarkets = async () => {
    await lendingMarketController
      .connect(owner)
      .createOrder(
        hexFILString,
        filMaturities[1],
        Side.BORROW,
        '1000000000',
        '8010',
      );

    await lendingMarketController
      .connect(owner)
      .depositAndCreateOrder(
        hexFILString,
        filMaturities[1],
        Side.LEND,
        '1000000000',
        '7990',
      );

    await lendingMarketController
      .connect(owner)
      .createOrder(
        hexUSDCString,
        usdcMaturities[1],
        Side.BORROW,
        '1000000',
        '8010',
      );

    await lendingMarketController
      .connect(owner)
      .depositAndCreateOrder(
        hexUSDCString,
        usdcMaturities[1],
        Side.LEND,
        '1000000',
        '7990',
      );

    if (usdcMaturities[0].gt(filMaturities[0])) {
      await time.increaseTo(usdcMaturities[0].toString());
    } else {
      await time.increaseTo(filMaturities[0].toString());
    }

    await lendingMarketController
      .connect(owner)
      .rotateLendingMarkets(hexFILString);
    await lendingMarketController
      .connect(owner)
      .rotateLendingMarkets(hexUSDCString);

    await lendingMarketController
      .connect(owner)
      .executeMultiItayoseCall(
        [hexFILString, hexUSDCString],
        usdcMaturities[usdcMaturities.length - 1],
      );

    await lendingMarketController
      .connect(owner)
      .cancelOrder(hexFILString, filMaturities[1], '1');
    await lendingMarketController
      .connect(owner)
      .cancelOrder(hexFILString, filMaturities[1], '2');

    await lendingMarketController
      .connect(owner)
      .cancelOrder(hexUSDCString, usdcMaturities[1], '1');
    await lendingMarketController
      .connect(owner)
      .cancelOrder(hexUSDCString, usdcMaturities[1], '2');
  };

  const resetContractInstances = async () => {
    filMaturities = await lendingMarketController.getMaturities(hexFILString);
    usdcMaturities = await lendingMarketController.getMaturities(hexUSDCString);

    await rotateAllMarkets();

    filMaturities = await lendingMarketController.getMaturities(hexFILString);
    usdcMaturities = await lendingMarketController.getMaturities(hexUSDCString);

    await filToETHPriceFeed.updateAnswer(filToETHRate);
    await usdcToUSDPriceFeed.updateAnswer(usdcToETHRate);
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());

    ({
      genesisDate,
      addressResolver,
      tokenVault,
      lendingMarketController,
      reserveFund,
      wETHToken,
      wFILToken,
      usdcToken,
      filToETHPriceFeed,
      usdcToUSDPriceFeed,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address, false);
    await tokenVault.registerCurrency(hexFILString, wFILToken.address, false);
    await tokenVault.registerCurrency(hexUSDCString, usdcToken.address, false);

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
    await mockUniswapRouter.setToken(hexUSDCString, usdcToken.address);
    await mockUniswapQuoter.setToken(hexETHString, wETHToken.address);
    await mockUniswapQuoter.setToken(hexFILString, wFILToken.address);
    await mockUniswapQuoter.setToken(hexUSDCString, usdcToken.address);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
      mockUniswapRouter.address,
      mockUniswapQuoter.address,
    );

    await tokenVault.updateCurrency(hexETHString, true);
    await tokenVault.updateCurrency(hexFILString, false);
    await tokenVault.updateCurrency(hexUSDCString, true);

    [owner] = await getUsers(1);

    await wFILToken
      .connect(owner)
      .transfer(mockUniswapRouter.address, initialFILBalance);
    await usdcToken
      .connect(owner)
      .transfer(mockUniswapRouter.address, initialUSDCBalance);

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexFILString, genesisDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createLendingMarket(hexUSDCString, genesisDate)
        .then((tx) => tx.wait());
    }

    await tokenVault
      .connect(owner)
      .deposit(hexETHString, '1000000000000000000000', {
        value: '1000000000000000000000',
      });

    ({ liquidatorFeeRate, liquidationProtocolFeeRate } =
      await tokenVault.getCollateralParameters());

    await lendingMarketController.connect(owner).registerLiquidator(true);
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

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });
        await tokenVault
          .connect(owner)
          .deposit(hexETHString, depositAmount.mul(3), {
            value: depositAmount.mul(3),
          });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexFILString,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(lendingMarketController, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8001',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexFILString),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexFILString, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute liquidation', async () => {
        await lendingMarketController.connect(carol).registerLiquidator(true);
        await filToETHPriceFeed.updateAnswer(
          filToETHRate.mul('110').div('100'),
        );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          FIL: filMaturities[0],
        });
        const reserveFundDepositBefore = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexFILString,
        );

        const receipt = await lendingMarketController
          .connect(carol)
          .executeLiquidationCall(
            hexETHString,
            hexFILString,
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

        const { amount } = receipt.events.find(
          ({ event }) => event === 'LiquidationExecuted',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          FIL: filMaturities[0],
        });
        lendingInfo.show();

        // Check the lending info
        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          lendingInfoAfter.pvs[0].sub(lendingInfoBefore.pvs[0].div(2)).abs(),
        ).to.lt(ERROR_RANGE);

        await expect(
          lendingMarketController
            .connect(carol)
            .executeLiquidationCall(
              hexETHString,
              hexFILString,
              filMaturities[0],
              alice.address,
              10,
            ),
        ).to.be.revertedWith('User has enough collateral');

        const [liquidatorFee, reserveFundDepositAfter] = await Promise.all(
          [carol, reserveFund].map(({ address }) =>
            tokenVault.getDepositAmount(address, hexFILString),
          ),
        );
        const protocolFee = reserveFundDepositAfter.sub(
          reserveFundDepositBefore,
        );

        // Check fees
        const liquidationAmountWithFee = amount
          .mul('10000')
          .div(
            ethers.BigNumber.from('10000')
              .sub(liquidatorFeeRate)
              .sub(liquidationProtocolFeeRate),
          );

        expect(
          amount
            .sub(liquidationAmountWithFee.sub(liquidatorFee).sub(protocolFee))
            .abs(),
        ).lte(1);

        // Withdraw from the reserve funds
        await expect(
          reserveFund.connect(owner).withdraw(hexFILString, protocolFee),
        ).to.emit(tokenVault, 'Withdraw');

        const reserveFundsAmountAfterWithdrawal =
          await tokenVault.getDepositAmount(reserveFund.address, hexFILString);
        expect(reserveFundsAmountAfterWithdrawal).to.equal('0');

        // Deposit to the reserve funds
        await wFILToken.connect(owner).approve(reserveFund.address, '1000');
        await expect(
          reserveFund.connect(owner).deposit(hexFILString, '1000'),
        ).to.emit(tokenVault, 'Deposit');

        const reserveFundsAmountAfterDeposit =
          await tokenVault.getDepositAmount(reserveFund.address, hexFILString);
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
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });
        await tokenVault
          .connect(owner)
          .deposit(hexETHString, depositAmount.mul(3), {
            value: depositAmount.mul(3),
          });

        await lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            filledOrderAmount,
            '8000',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .createOrder(
              hexFILString,
              filMaturities[0],
              Side.BORROW,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(lendingMarketController, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexFILString),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexFILString, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(
          aliceBalanceAfter
            .sub(aliceInitialBalance)
            .sub(filledOrderAmount)
            .abs(),
        ).to.lt(ERROR_RANGE);
      });

      it('Execute liquidation', async () => {
        await filToETHPriceFeed.updateAnswer(
          filToETHRate.mul('110').div('100'),
        );

        const rfFutureValueBefore =
          await lendingMarketController.getFutureValue(
            hexFILString,
            filMaturities[0],
            reserveFund.address,
          );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          FIL: filMaturities[0],
        });

        await expect(
          lendingMarketController.executeLiquidationCall(
            hexETHString,
            hexFILString,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const rfFutureValueAfter = await lendingMarketController.getFutureValue(
          hexFILString,
          filMaturities[0],
          reserveFund.address,
        );

        const lendingInfoAfter = await lendingInfo.load('After', {
          FIL: filMaturities[0],
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
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });
        await tokenVault
          .connect(owner)
          .deposit(hexETHString, depositAmount.mul(3), {
            value: depositAmount.mul(3),
          });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );
        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexFILString,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(lendingMarketController, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexFILString),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexFILString, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(
          aliceBalanceAfter
            .sub(aliceInitialBalance)
            .sub(filledOrderAmount)
            .abs(),
        ).to.lt(ERROR_RANGE);
      });

      it('Execute liquidation twice', async () => {
        await filToETHPriceFeed.updateAnswer(
          filToETHRate.mul('115').div('100'),
        );

        const rfFutureValueBefore =
          await lendingMarketController.getFutureValue(
            hexFILString,
            filMaturities[0],
            reserveFund.address,
          );
        const lendingInfoBefore = await lendingInfo.load('Before', {
          FIL: filMaturities[0],
        });

        await expect(
          lendingMarketController.executeLiquidationCall(
            hexETHString,
            hexFILString,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const rfFutureValueAfter = await lendingMarketController.getFutureValue(
          hexFILString,
          filMaturities[0],
          reserveFund.address,
        );
        const tokenVaultBalanceAfter = await wETHToken.balanceOf(
          tokenVault.address,
        );
        const lendingInfoAfter1 = await lendingInfo.load('After1', {
          FIL: filMaturities[0],
        });

        expect(rfFutureValueAfter.lt(rfFutureValueBefore));
        expect(rfFutureValueAfter.gte(0));

        await expect(
          lendingMarketController.executeLiquidationCall(
            hexETHString,
            hexFILString,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const tokenVaultBalanceAfter2 = await wETHToken.balanceOf(
          tokenVault.address,
        );
        const lendingInfoAfter2 = await lendingInfo.load('After2', {
          FIL: filMaturities[0],
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
          lendingMarketController.executeLiquidationCall(
            hexETHString,
            hexFILString,
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
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });
        await tokenVault
          .connect(owner)
          .deposit(hexETHString, depositAmount.mul(3), {
            value: depositAmount.mul(3),
          });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );
        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexFILString,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(lendingMarketController, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexFILString),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexFILString, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
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
            hexFILString,
            filMaturities[1],
            Side.BORROW,
            '1000000000',
            '8001',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[1],
            Side.LEND,
            '1000000000',
            '7999',
          );

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexFILString,
            filMaturities[1],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8000',
          );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          FIL: filMaturities[1],
        });

        await expect(
          lendingMarketController.executeLiquidationCall(
            hexETHString,
            hexFILString,
            filMaturities[1],
            alice.address,
            10,
          ),
        ).to.emit(lendingMarketController, 'LiquidationExecuted');

        const lendingInfoAfter = await lendingInfo.load('After', {
          FIL: filMaturities[1],
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
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETHString, depositAmount, {
          value: depositAmount,
        });
        await tokenVault
          .connect(owner)
          .deposit(hexETHString, depositAmount.mul(3), {
            value: depositAmount.mul(3),
          });

        await lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '8000',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndCreateOrder(
              hexFILString,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(lendingMarketController, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .createOrder(
            hexFILString,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '8001',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '7999',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexFILString),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexFILString, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute liquidation', async () => {
        await lendingMarketController.connect(carol).registerLiquidator(true);
        await filToETHPriceFeed.updateAnswer(filToETHRate.mul('3'));

        const lendingInfoBefore = await lendingInfo.load('Before', {
          FIL: filMaturities[0],
        });
        const reserveFundDepositBefore = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexFILString,
        );

        const receipt = await lendingMarketController
          .connect(carol)
          .executeLiquidationCall(
            hexETHString,
            hexFILString,
            filMaturities[0],
            alice.address,
            10,
          )
          .then((tx) => tx.wait());

        const { user, collateralCcy, debtCcy, debtMaturity, amount } =
          receipt.events.find(
            ({ event }) => event === 'LiquidationExecuted',
          ).args;

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETHString);
        expect(debtCcy).to.equal(hexFILString);
        expect(debtMaturity).to.equal(filMaturities[0]);
        expect(amount.lt(filledOrderAmount.div(2))).to.true;

        const lendingInfoAfter = await lendingInfo.load('After', {
          FIL: filMaturities[0],
        });
        lendingInfo.show();

        expect(lendingInfoAfter.coverage.gt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          lendingInfoAfter.pvs[0]
            .abs()
            .gt(lendingInfoBefore.pvs[0].div(2).abs()),
        ).to.true;

        // Check fees
        const [liquidatorFee, reserveFundDepositAfter] = await Promise.all(
          [carol, reserveFund].map(({ address }) =>
            tokenVault.getDepositAmount(address, hexFILString),
          ),
        );
        const protocolFee = reserveFundDepositAfter.sub(
          reserveFundDepositBefore,
        );

        const liquidationAmountWithFee = amount
          .mul('10000')
          .div(
            ethers.BigNumber.from('10000')
              .sub(liquidatorFeeRate)
              .sub(liquidationProtocolFeeRate),
          );

        // NOTE: The calculation order above is different from the actual calculation order in the smart contract
        // so it might have a calculation error of 1 by truncation specification of Solidity.
        expect(
          amount
            .sub(liquidationAmountWithFee.sub(liquidatorFee).sub(protocolFee))
            .abs(),
        ).lte(1);
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

      const aliceFILBalanceBefore = await wFILToken.balanceOf(alice.address);
      const aliceUSDCBalanceBefore = await usdcToken.balanceOf(alice.address);

      await tokenVault
        .connect(alice)
        .deposit(hexETHString, depositAmountInETH, {
          value: depositAmountInETH,
        });

      await tokenVault
        .connect(owner)
        .deposit(hexETHString, depositAmountInETH.mul(5), {
          value: depositAmountInETH.mul(5),
        });

      // Create order on FIL market
      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          filledOrderAmountInFIL,
          '8000',
        );

      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          filledOrderAmountInFIL.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            filMaturities[0],
            Side.LEND,
            filledOrderAmountInFIL,
            '0',
          ),
      ).to.emit(lendingMarketController, 'OrderFilled');

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          filMaturities[0],
          Side.LEND,
          '10000000000000000000',
          '7999',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexFILString),
      ).to.equal(filledOrderAmountInFIL);

      await tokenVault
        .connect(alice)
        .withdraw(hexFILString, filledOrderAmountInFIL);

      const aliceFILBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceFILBalanceAfter.sub(aliceFILBalanceBefore)).to.equal(
        filledOrderAmountInFIL,
      );

      // Create order on USDC market
      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexUSDCString,
          usdcMaturities[0],
          Side.BORROW,
          filledOrderAmountInUSDC,
          '8000',
        );
      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexUSDCString,
          usdcMaturities[0],
          Side.BORROW,
          filledOrderAmountInUSDC.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexUSDCString,
            usdcMaturities[0],
            Side.LEND,
            filledOrderAmountInUSDC,
            '0',
          ),
      ).to.emit(lendingMarketController, 'OrderFilled');

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexUSDCString,
          usdcMaturities[0],
          Side.LEND,
          '10000000000000',
          '7999',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexUSDCString),
      ).to.equal(filledOrderAmountInUSDC);

      await tokenVault
        .connect(alice)
        .withdraw(hexUSDCString, filledOrderAmountInUSDC);

      const aliceUSDCBalanceAfter = await usdcToken.balanceOf(alice.address);
      expect(aliceUSDCBalanceAfter.sub(aliceUSDCBalanceBefore)).to.equal(
        filledOrderAmountInUSDC,
      );
    });

    it('Take orders from both FIL & USDC markets, Liquidate the larger position', async () => {
      await lendingInfo.load('Before1', {
        FIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await filToETHPriceFeed.updateAnswer(filToETHRate.mul('110').div('100'));

      const lendingInfoBefore = await lendingInfo.load('Before2', {
        FIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          usdcMaturities[0],
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'LiquidationExecuted');

      const lendingInfoAfter = await lendingInfo.load('After', {
        FIL: filMaturities[0],
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
        FIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await filToETHPriceFeed.updateAnswer(filToETHRate.mul('110').div('100'));

      const lendingInfoBefore = await lendingInfo.load('Before2', {
        FIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexUSDCString,
          usdcMaturities[0],
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'LiquidationExecuted');

      const lendingInfoAfter = await lendingInfo.load('After', {
        FIL: filMaturities[0],
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
