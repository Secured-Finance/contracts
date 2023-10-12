import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import BigNumberJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PCT_DIGIT,
} from '../common/constants';
import {
  usdcToETHRate,
  usdcToUSDRate,
  wFilToETHRate,
} from '../common/currencies';
import { deployContracts } from '../common/deployment';
import { calculateFutureValue, getAmountWithOrderFee } from '../common/orders';
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
  let lendingMarketReader: Contract;
  let reserveFund: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let usdcToken: Contract;
  let wFilToETHPriceFeed: Contract;
  let usdcToUSDPriceFeed: Contract;

  let fundManagementLogic: Contract;
  let liquidationLogic: Contract;

  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;
  let liquidator: Contract;

  let genesisDate: number;
  let ethMaturities: BigNumber[];
  let filMaturities: BigNumber[];
  let usdcMaturities: BigNumber[];

  let liquidatorFeeRate: BigNumber;
  let liquidationProtocolFeeRate: BigNumber;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialFILBalance = BigNumber.from('1000000000000000000000');
  const initialUSDCBalance = BigNumber.from('100000000000000');

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
          case 'WFIL':
            return hexWFIL;
          default:
            return hexETH;
        }
      };

      const [coverage, filDeposit, ethDeposit, usdcDeposit, ...pvs] =
        await Promise.all([
          tokenVault.getCoverage(this.address),
          tokenVault.getDepositAmount(this.address, hexWFIL),
          tokenVault.getDepositAmount(this.address, hexETH),
          tokenVault.getDepositAmount(this.address, hexUSDC),
          ...Object.entries(maturities).map(([key, maturity]) =>
            lendingMarketController
              .getPosition(getCcy(key.split('-')[0]), maturity, this.address)
              .then(({ presentValue }) => presentValue),
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
        'Deposit(WFIL)': filDeposit.toString(),
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

  const rotateAllMarkets = async (unitPrice = '9600') => {
    const { timestamp } = await ethers.provider.getBlock('latest');

    if (usdcMaturities[0].gt(timestamp)) {
      await time.increaseTo(usdcMaturities[0].sub('21600').toString());
    }

    await lendingMarketController
      .connect(owner)
      .executeOrder(
        hexWFIL,
        filMaturities[1],
        Side.BORROW,
        '100000000',
        unitPrice,
      );

    await lendingMarketController
      .connect(owner)
      .depositAndExecuteOrder(
        hexWFIL,
        filMaturities[1],
        Side.LEND,
        '100000000',
        unitPrice,
      );

    await lendingMarketController
      .connect(owner)
      .executeOrder(
        hexUSDC,
        usdcMaturities[1],
        Side.BORROW,
        '100000',
        unitPrice,
      );

    await lendingMarketController
      .connect(owner)
      .depositAndExecuteOrder(
        hexUSDC,
        usdcMaturities[1],
        Side.LEND,
        '100000',
        unitPrice,
      );

    if (usdcMaturities[0].gt(timestamp)) {
      await time.increaseTo(usdcMaturities[0].toString());
    }

    await lendingMarketController.connect(owner).rotateOrderBooks(hexWFIL);
    await lendingMarketController.connect(owner).rotateOrderBooks(hexUSDC);

    await lendingMarketController
      .connect(owner)
      .executeItayoseCalls(
        [hexWFIL, hexUSDC],
        usdcMaturities[usdcMaturities.length - 1],
      );
  };

  const resetMaturities = async () => {
    [ethMaturities, filMaturities, usdcMaturities] = await Promise.all(
      [hexETH, hexWFIL, hexUSDC].map((hexCcy) =>
        lendingMarketController.getMaturities(hexCcy),
      ),
    );
  };

  const resetContractInstances = async (unitPrice?: string) => {
    await resetMaturities();
    await rotateAllMarkets(unitPrice);

    [ethMaturities, filMaturities, usdcMaturities] = await Promise.all(
      [hexETH, hexWFIL, hexUSDC].map((hexCcy) =>
        lendingMarketController.getMaturities(hexCcy),
      ),
    );

    await wFilToETHPriceFeed.updateAnswer(wFilToETHRate);
    await usdcToUSDPriceFeed.updateAnswer(usdcToUSDRate);

    liquidator = await ethers
      .getContractFactory('Liquidator')
      .then((factory) =>
        factory.deploy(
          hexETH,
          lendingMarketController.address,
          tokenVault.address,
          mockUniswapRouter.address,
          mockUniswapQuoter.address,
        ),
      );
  };

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());

    ({
      genesisDate,
      fundManagementLogic,
      liquidationLogic,
      addressResolver,
      currencyController,
      tokenVault,
      lendingMarketController,
      lendingMarketReader,
      reserveFund,
      wETHToken,
      wFILToken,
      usdcToken,
      wFilToETHPriceFeed,
      usdcToUSDPriceFeed,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);
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
    await mockUniswapRouter.setToken(hexWFIL, wFILToken.address);
    await mockUniswapRouter.setToken(hexUSDC, usdcToken.address);
    await mockUniswapQuoter.setToken(hexETH, wETHToken.address);
    await mockUniswapQuoter.setToken(hexWFIL, wFILToken.address);
    await mockUniswapQuoter.setToken(hexUSDC, usdcToken.address);

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexWFIL, false);
    await tokenVault.updateCurrency(hexUSDC, true);

    [owner] = await getUsers(1);

    await wFILToken
      .connect(owner)
      .transfer(mockUniswapRouter.address, initialFILBalance.mul(10));
    await usdcToken
      .connect(owner)
      .transfer(mockUniswapRouter.address, initialUSDCBalance.mul(10));
    await owner.sendTransaction({
      to: mockUniswapRouter.address,
      value: initialETHBalance.mul(10),
    });

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createOrderBook(hexWFIL, genesisDate, genesisDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createOrderBook(hexUSDC, genesisDate, genesisDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createOrderBook(hexETH, genesisDate, genesisDate)
        .then((tx) => tx.wait());
    }

    await tokenVault.connect(owner).deposit(hexETH, '1000000000000000000000', {
      value: '1000000000000000000000',
    });

    ({ liquidatorFeeRate, liquidationProtocolFeeRate } =
      await tokenVault.getLiquidationConfiguration());
  });

  describe('Liquidations on FIL(non-collateral currency) market by ETH', async () => {
    describe('Increase FIL exchange rate, Execute liquidation once, Manage reserve funds', async () => {
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

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '9599',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute liquidation', async () => {
        await wFilToETHPriceFeed.updateAnswer(
          wFilToETHRate.mul('110').div('100'),
        );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          WFIL: filMaturities[0],
        });
        const reserveFundDepositBefore = await tokenVault.getDepositAmount(
          reserveFund.address,
          hexETH,
        );

        await reserveFund.pause();

        const receipt = await liquidator
          .executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            10,
          )
          .then(async (tx) => {
            await expect(tx).to.emit(liquidationLogic, 'LiquidationExecuted');
            return tx.wait();
          });

        await reserveFund.unpause();

        const { receivedDebtAmount } = receipt.events.find(
          ({ event }) => event === 'OperationExecuteForDebt',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[0],
        });
        lendingInfo.show();

        // Check the lending info
        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          BigNumberJS(lendingInfoAfter.pvs[0].toString())
            .times(100)
            .div(lendingInfoBefore.pvs[0].toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.be.revertedWith(
          `NoLiquidationAmount("${alice.address}", "${hexETH}")`,
        );

        const [
          liquidatorBalanceETH,
          liquidatorBalanceWFIL,
          reserveFundDepositETHAfter,
          reserveFundDepositWFILAfter,
        ] = await Promise.all(
          [liquidator, reserveFund]
            .map(({ address }) => [
              tokenVault.getDepositAmount(address, hexETH),
              tokenVault.getDepositAmount(address, hexWFIL),
            ])
            .flat(),
        );
        const protocolFeeETH = reserveFundDepositETHAfter.sub(
          reserveFundDepositBefore,
        );

        const protocolFeeWFIL = await currencyController[
          'convert(bytes32,bytes32,uint256)'
        ](hexETH, hexWFIL, protocolFeeETH);

        expect(liquidatorBalanceETH).to.equal(0);
        expect(reserveFundDepositWFILAfter).to.equal(0);

        // Check fees
        const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);
        const unwindFee = receivedDebtAmount
          .sub(
            getAmountWithOrderFee(
              Side.LEND,
              receivedDebtAmount,
              filMaturities[0].sub(timestamp),
            ),
          )
          .abs();

        expect(
          BigNumberJS(receivedDebtAmount.toString())
            .times(100)
            .div(filledOrderAmount.toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');

        expect(
          liquidatorBalanceWFIL
            .add(unwindFee)
            .sub(receivedDebtAmount.mul(liquidatorFeeRate).div('10000'))
            .abs(),
        ).to.lte(1);
        expect(protocolFeeWFIL).to.equal(
          receivedDebtAmount.mul(liquidationProtocolFeeRate).div('10000'),
        );

        // Withdraw from the reserve funds
        await expect(
          reserveFund.connect(owner).withdraw(hexETH, protocolFeeETH),
        ).to.emit(tokenVault, 'Withdraw');

        const reserveFundsAmountAfterWithdrawal =
          await tokenVault.getDepositAmount(reserveFund.address, hexETH);
        expect(reserveFundsAmountAfterWithdrawal).to.equal('0');

        // Deposit to the reserve funds
        await wFILToken.connect(owner).approve(reserveFund.address, '1000');
        await expect(
          reserveFund.connect(owner).deposit(hexWFIL, '1000'),
        ).to.emit(tokenVault, 'Deposit');

        const reserveFundsAmountAfterDeposit =
          await tokenVault.getDepositAmount(reserveFund.address, hexWFIL);
        expect(reserveFundsAmountAfterDeposit).to.equal('1000');
      });
    });

    describe('Increase FIL exchange rate, Execute liquidation twice', async () => {
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

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '9600',
          );
        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            filledOrderAmount,
            '9599',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(
          aliceBalanceAfter
            .sub(aliceInitialBalance)
            .sub(filledOrderAmount)
            .abs(),
        ).to.lt(ERROR_RANGE);
      });

      it('Execute liquidation twice', async () => {
        await wFilToETHPriceFeed.updateAnswer(
          wFilToETHRate.mul('115').div('100'),
        );

        const { futureValue: rfFutureValueBefore } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            reserveFund.address,
          );
        const lendingInfoBefore = await lendingInfo.load('Before', {
          WFIL: filMaturities[0],
        });

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(liquidationLogic, 'LiquidationExecuted');

        const { futureValue: rfFutureValueAfter } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            reserveFund.address,
          );
        const tokenVaultBalanceAfter = await wETHToken.balanceOf(
          tokenVault.address,
        );
        const lendingInfoAfter1 = await lendingInfo.load('After1', {
          WFIL: filMaturities[0],
        });

        expect(rfFutureValueAfter.lt(rfFutureValueBefore));
        expect(rfFutureValueAfter.gte(0));

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.emit(liquidationLogic, 'LiquidationExecuted');

        const tokenVaultBalanceAfter2 = await wETHToken.balanceOf(
          tokenVault.address,
        );
        const lendingInfoAfter2 = await lendingInfo.load('After2', {
          WFIL: filMaturities[0],
        });

        lendingInfo.show();

        expect(tokenVaultBalanceAfter2.lt(tokenVaultBalanceAfter));
        expect(tokenVaultBalanceAfter2.gte(0));
        expect(lendingInfoAfter1.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(lendingInfoAfter2.coverage.lt(lendingInfoAfter1.coverage)).to
          .true;

        expect(
          BigNumberJS(lendingInfoAfter1.pvs[0].toString())
            .times(100)
            .div(lendingInfoBefore.pvs[0].toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');

        expect(
          BigNumberJS(lendingInfoAfter2.pvs[0].toString())
            .times(100)
            .div(lendingInfoAfter1.pvs[0].toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            10,
          ),
        ).to.be.revertedWith(
          `NoLiquidationAmount("${alice.address}", "${hexETH}")`,
        );
      });
    });

    describe('Execute auto-roll a borrowing position, Execute liquidation after auto-roll', async () => {
      const filledOrderAmount = BigNumber.from('210000000000000000000');
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

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '9600',
          );
        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '9599',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '210000000000000000000');

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
          .executeOrder(
            hexWFIL,
            filMaturities[1],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        const lendingInfoBefore = await lendingInfo.load('Before', {
          WFIL: filMaturities[1],
        });

        await expect(
          liquidator.executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[1],
            alice.address,
            10,
          ),
        ).to.emit(liquidationLogic, 'LiquidationExecuted');

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[1],
        });
        lendingInfo.show();

        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          BigNumberJS(lendingInfoAfter.pvs[0].toString())
            .times(100)
            .div(lendingInfoBefore.pvs[0].toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');
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

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute liquidation', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul('3'));

        const lendingInfoBefore = await lendingInfo.load('Before', {
          WFIL: filMaturities[0],
        });

        const receipt = await liquidator
          .executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
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
          receivedDebtAmount,
        } = receipt.events.find(
          ({ event }) => event === 'OperationExecuteForDebt',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[0],
        });
        lendingInfo.show();

        const { futureValue: liquidatorFutureValue } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            liquidator.address,
          );
        const liquidatorDepositAmount = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETH);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[0]);

        expect(lendingInfoAfter.coverage.gt(lendingInfoBefore.coverage)).to
          .true;

        expect(liquidatorFutureValue).to.equal(0);
        expect(liquidatorDepositAmount).not.equal(0);
        expect(receivedDebtAmount).lt(filledOrderAmount.div(2));
        expect(receivedCollateralAmount).gt(depositAmount);
      });

      it('Withdraw funds on Liquidator contract', async () => {
        const beforeWithdrawal = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );
        expect(beforeWithdrawal).not.equal(0);

        // owner withdraws fund on Liquidator contract
        await expect(
          liquidator.connect(owner).withdraw(hexWFIL, beforeWithdrawal),
        ).to.emit(tokenVault, 'Withdraw');

        const afterWithdrawal = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );
        expect(afterWithdrawal).equal(0);
      });
    });

    describe('Liquidate partially due to insufficient collateral without the reserve fund after auto-roll', async () => {
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

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[1],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute auto-roll', async () => {
        await rotateAllMarkets();
      });

      it('Execute liquidation', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul('3'));

        const lendingInfoBefore = await lendingInfo.load('Before', {
          WFIL: filMaturities[1],
        });

        await reserveFund.pause();

        const receipt = await liquidator
          .executeLiquidationCall(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[1],
            alice.address,
            10,
          )
          .then((tx) => tx.wait());

        await reserveFund.unpause();

        const {
          user,
          collateralCcy,
          debtCcy,
          debtMaturity,
          receivedDebtAmount,
        } = receipt.events.find(
          ({ event }) => event === 'OperationExecuteForDebt',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[1],
        });
        lendingInfo.show();

        const { futureValue: liquidatorFutureValue } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[1],
            liquidator.address,
          );
        const liquidatorDepositAmount = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETH);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[1]);

        expect(lendingInfoAfter.coverage.gt(lendingInfoBefore.coverage)).to
          .true;

        expect(liquidatorFutureValue).to.equal(0);
        expect(liquidatorDepositAmount).not.equal(0);
        expect(receivedDebtAmount).to.lte(filledOrderAmount.div(2));
      });
    });

    describe("Liquidate a borrowing position using the user's deposits and lending positions", async () => {
      const orderAmountInETH = BigNumber.from('1000000000000000000');
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);
      const orderAmountInUSDC = orderAmountInETH
        .mul(BigNumber.from(10).pow(6))
        .div(usdcToETHRate);
      let lendingInfo: LendingInfo;
      let bobInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(bob.address);
      });

      it('Create orders on the USDC market', async () => {
        bobInitialBalance = await wFILToken.balanceOf(bob.address);

        await tokenVault
          .connect(alice)
          .deposit(hexETH, orderAmountInETH.mul(2), {
            value: orderAmountInETH.mul(2),
          });
        await tokenVault
          .connect(owner)
          .deposit(hexETH, orderAmountInETH.mul(4), {
            value: orderAmountInETH.mul(4),
          });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexUSDC,
            filMaturities[0],
            Side.BORROW,
            orderAmountInUSDC,
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexUSDC,
              filMaturities[0],
              Side.LEND,
              orderAmountInUSDC,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexUSDC,
            filMaturities[0],
            Side.LEND,
            orderAmountInUSDC,
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(bob.address, hexUSDC),
        ).to.equal(0);

        expect(
          await lendingMarketController.getTotalPresentValue(
            hexUSDC,
            bob.address,
          ),
        ).not.to.equal(0);
      });

      it('Create orders on the FIL market', async () => {
        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL.div(2),
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              orderAmountInFIL.div(2),
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(bob.address, hexWFIL),
        ).to.equal(orderAmountInFIL.div(2));
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(bob)
          .withdraw(hexWFIL, orderAmountInFIL.div(2));

        const bobBalanceAfter = await wFILToken.balanceOf(bob.address);

        expect(bobBalanceAfter.sub(bobInitialBalance)).to.equal(
          orderAmountInFIL.div(2),
        );
      });

      it('Execute liquidation', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul(3).div(2));

        const lendingInfoBefore = await lendingInfo.load('User(Before)', {
          WFIL: filMaturities[0],
          USDC: usdcMaturities[0],
        });

        const receipt = await liquidator
          .executeLiquidationCall(
            hexUSDC,
            usdcMaturities,
            hexWFIL,
            filMaturities[0],
            bob.address,
            10,
          )
          .then((tx) => tx.wait());

        const { user, collateralCcy, debtCcy, debtMaturity } =
          receipt.events.find(
            ({ event }) => event === 'OperationExecuteForDebt',
          ).args;

        const lendingInfoAfter = await lendingInfo.load('User(After)', {
          WFIL: filMaturities[0],
          USDC: usdcMaturities[0],
        });
        lendingInfo.show();

        expect(user).to.equal(bob.address);
        expect(collateralCcy).to.equal(hexUSDC);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[0]);

        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;
        expect(
          BigNumberJS(lendingInfoAfter.pvs[0].toString())
            .times(100)
            .div(lendingInfoBefore.pvs[0].toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');

        const liquidatorLendingInfo = new LendingInfo(liquidator.address);
        await liquidatorLendingInfo.load('Liquidator', {
          WFIL: filMaturities[0],
          USDC: usdcMaturities[0],
        });

        liquidatorLendingInfo.show();
      });
    });

    describe("Liquidate a borrowing position using the user's lending positions after two auto-rolls", async () => {
      const orderAmountInETH = BigNumber.from('1000000000000000000');
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);
      const orderAmountInUSDC = orderAmountInETH
        .mul(BigNumber.from(10).pow(6))
        .div(usdcToETHRate);

      let lendingInfo: LendingInfo;
      let bobInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(bob.address);
      });

      it('Create orders on the USDC market', async () => {
        bobInitialBalance = await wFILToken.balanceOf(bob.address);

        await tokenVault
          .connect(alice)
          .deposit(hexETH, orderAmountInETH.mul(2), {
            value: orderAmountInETH.mul(2),
          });
        await tokenVault
          .connect(owner)
          .deposit(hexETH, orderAmountInETH.mul(4), {
            value: orderAmountInETH.mul(4),
          });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexUSDC,
            filMaturities[1],
            Side.BORROW,
            orderAmountInUSDC,
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexUSDC,
              filMaturities[1],
              Side.LEND,
              orderAmountInUSDC,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexUSDC,
            filMaturities[1],
            Side.BORROW,
            orderAmountInUSDC.mul(2),
            '9600',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexUSDC,
            filMaturities[1],
            Side.LEND,
            orderAmountInUSDC,
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(bob.address, hexUSDC),
        ).to.equal(0);

        expect(
          await lendingMarketController.getTotalPresentValue(
            hexUSDC,
            bob.address,
          ),
        ).not.to.equal(0);
      });

      it('Create orders on the FIL market', async () => {
        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexWFIL,
            filMaturities[1],
            Side.BORROW,
            orderAmountInFIL.div(2),
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[1],
              Side.LEND,
              orderAmountInFIL.div(2),
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[1],
            Side.BORROW,
            orderAmountInFIL,
            '9600',
          );

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[1],
            Side.LEND,
            orderAmountInFIL,
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(bob.address, hexWFIL),
        ).to.equal(orderAmountInFIL.div(2));
      });

      it('Execute auto-roll twice', async () => {
        await rotateAllMarkets();
        await resetMaturities();

        await rotateAllMarkets();
        await resetMaturities();
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(bob)
          .withdraw(hexWFIL, orderAmountInFIL.div(2));

        const bobBalanceAfter = await wFILToken.balanceOf(bob.address);

        expect(bobBalanceAfter.sub(bobInitialBalance)).to.equal(
          orderAmountInFIL.div(2),
        );
      });

      it('Create orders for unwinding', async () => {
        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexUSDC,
            filMaturities[0],
            Side.LEND,
            orderAmountInUSDC.mul(2),
            '9600',
          );
      });

      it('Execute liquidation', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul(7).div(5));

        await usdcToken
          .connect(carol)
          .approve(lendingMarketController.address, orderAmountInUSDC);
        await tokenVault.connect(carol).deposit(hexUSDC, orderAmountInUSDC);

        await lendingInfo.load('User(Before)', {
          WFIL: filMaturities[0],
          USDC: usdcMaturities[0],
        });

        const liquidatorLendingInfo = new LendingInfo(owner.address);
        await liquidatorLendingInfo.load('Liquidator(Before)', {
          WFIL: filMaturities[0],
          USDC: usdcMaturities[0],
        });

        await lendingMarketController
          .executeLiquidationCall(
            hexUSDC,
            hexWFIL,
            filMaturities[0],
            bob.address,
          )
          .then((tx) => tx.wait());

        await lendingInfo.load('User(After)', {
          WFIL: filMaturities[0],
          USDC: usdcMaturities[0],
        });
        lendingInfo.show();

        const liquidatorInfoAfter = await liquidatorLendingInfo.load(
          'Liquidator(After)',
          {
            WFIL: filMaturities[0],
            USDC: usdcMaturities[0],
          },
        );

        liquidatorLendingInfo.show();

        expect(liquidatorInfoAfter.coverage).gt(0);
        expect(liquidatorInfoAfter.pvs[0]).lt(0);
        expect(liquidatorInfoAfter.pvs[1]).gt(0);

        const pv0InUSDC = liquidatorInfoAfter.pvs[0]
          .mul(wFilToETHRate.mul(7).div(5))
          .div(BigNumber.from(10).pow(12))
          .div(usdcToETHRate);

        expect(
          BigNumberJS(liquidatorInfoAfter.pvs[1].toString())
            .times(PCT_DIGIT)
            .div(pv0InUSDC.toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('10500');
      });
    });

    describe("Liquidate a borrowing position using the user's multiple lending positions", async () => {
      const orderAmountInETH = BigNumber.from('1000000000000000000');
      const orderAmountInFIL = orderAmountInETH
        .mul(BigNumber.from(10).pow(18))
        .div(wFilToETHRate);
      const orderAmountInUSDC = orderAmountInETH
        .mul(BigNumber.from(10).pow(6))
        .div(usdcToETHRate);
      let lendingInfo: LendingInfo;
      let bobInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(bob.address);
      });

      after(async () => {
        await rotateAllMarkets();
      });

      it('Create orders on the multiple USDC markets', async () => {
        bobInitialBalance = await wFILToken.balanceOf(bob.address);

        await tokenVault
          .connect(alice)
          .deposit(hexETH, orderAmountInETH.mul(2), {
            value: orderAmountInETH.mul(2),
          });
        await tokenVault
          .connect(owner)
          .deposit(hexETH, orderAmountInETH.mul(4), {
            value: orderAmountInETH.mul(4),
          });

        for (let i = 0; i < 2; i++) {
          await lendingMarketController
            .connect(alice)
            .executeOrder(
              hexUSDC,
              filMaturities[i],
              Side.BORROW,
              orderAmountInUSDC.div(3).mul(1 + i),
              '9600',
            );

          await expect(
            lendingMarketController
              .connect(bob)
              .depositAndExecuteOrder(
                hexUSDC,
                filMaturities[i],
                Side.LEND,
                orderAmountInUSDC.div(3).mul(1 + i),
                '0',
              ),
          ).to.emit(fundManagementLogic, 'OrderFilled');

          await lendingMarketController
            .connect(owner)
            .depositAndExecuteOrder(
              hexUSDC,
              filMaturities[i],
              Side.LEND,
              orderAmountInUSDC,
              '9600',
            );
        }

        expect(
          await tokenVault.getDepositAmount(bob.address, hexUSDC),
        ).to.equal(0);

        expect(
          await lendingMarketController.getTotalPresentValue(
            hexUSDC,
            bob.address,
          ),
        ).not.to.equal(0);
      });

      it('Create orders on the FIL market', async () => {
        await lendingMarketController
          .connect(bob)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL.div(2),
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              orderAmountInFIL.div(2),
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '9600',
          );

        expect(
          await tokenVault.getDepositAmount(bob.address, hexWFIL),
        ).to.equal(orderAmountInFIL.div(2));
      });

      it('Withdraw', async () => {
        await tokenVault.connect(bob).withdraw(hexWFIL, orderAmountInFIL);

        const bobBalanceAfter = await wFILToken.balanceOf(bob.address);

        expect(bobBalanceAfter.sub(bobInitialBalance)).to.equal(
          orderAmountInFIL.div(2),
        );
      });

      it('Execute liquidation', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul(3).div(2));

        const lendingInfoBefore = await lendingInfo.load('User(Before)', {
          WFIL: filMaturities[0],
          'USDC-1': usdcMaturities[0],
          'USDC-2': usdcMaturities[1],
        });

        const receipt = await liquidator
          .executeLiquidationCall(
            hexUSDC,
            usdcMaturities,
            hexWFIL,
            filMaturities[0],
            bob.address,
            10,
          )
          .then((tx) => tx.wait());

        const { user, collateralCcy, debtCcy, debtMaturity } =
          receipt.events.find(
            ({ event }) => event === 'OperationExecuteForDebt',
          ).args;

        const lendingInfoAfter = await lendingInfo.load('User(After)', {
          WFIL: filMaturities[0],
          'USDC-1': usdcMaturities[0],
          'USDC-2': usdcMaturities[1],
        });
        lendingInfo.show();

        expect(user).to.equal(bob.address);
        expect(collateralCcy).to.equal(hexUSDC);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[0]);

        expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to
          .true;

        expect(
          BigNumberJS(lendingInfoAfter.pvs[0].toString())
            .times(100)
            .div(lendingInfoBefore.pvs[0].toString())
            .abs()
            .dp(0)
            .toString(),
        ).to.equal('50');

        const liquidatorLendingInfo = new LendingInfo(liquidator.address);
        await liquidatorLendingInfo.load('Liquidator', {
          WFIL: filMaturities[0],
          'USDC-1': usdcMaturities[0],
          'USDC-2': usdcMaturities[1],
        });

        liquidatorLendingInfo.show();
      });
    });
  });

  describe('Liquidations on multiple market', async () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let lendingInfo: LendingInfo;

    const filledOrderAmountInFIL = BigNumber.from('200000000000000000000');
    const filledOrderAmountInUSDC = BigNumber.from('600000000');
    const depositAmountInETH = BigNumber.from('1750000000000000000');

    beforeEach(async () => {
      [alice, bob] = await getUsers(2);
      await resetContractInstances('9500');
      lendingInfo = new LendingInfo(alice.address);

      const aliceFILBalanceBefore = await wFILToken.balanceOf(alice.address);
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
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.BORROW,
          filledOrderAmountInFIL,
          '9500',
        );

      await lendingMarketController
        .connect(owner)
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.BORROW,
          filledOrderAmountInFIL.mul(2),
          '9500',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            filledOrderAmountInFIL,
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketController
        .connect(owner)
        .depositAndExecuteOrder(
          hexWFIL,
          filMaturities[0],
          Side.LEND,
          '10000000000000000000',
          '9499',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexWFIL),
      ).to.equal(filledOrderAmountInFIL);

      await tokenVault.connect(alice).withdraw(hexWFIL, filledOrderAmountInFIL);

      const aliceFILBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceFILBalanceAfter.sub(aliceFILBalanceBefore)).to.equal(
        filledOrderAmountInFIL,
      );

      // Create order on USDC market
      await lendingMarketController
        .connect(alice)
        .executeOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.BORROW,
          filledOrderAmountInUSDC,
          '9500',
        );
      await lendingMarketController
        .connect(owner)
        .executeOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.BORROW,
          filledOrderAmountInUSDC.mul(2),
          '9500',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexUSDC,
            usdcMaturities[0],
            Side.LEND,
            filledOrderAmountInUSDC,
            '0',
          ),
      ).to.emit(fundManagementLogic, 'OrderFilled');

      await lendingMarketController
        .connect(owner)
        .depositAndExecuteOrder(
          hexUSDC,
          usdcMaturities[0],
          Side.LEND,
          '10000000000000',
          '9499',
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
        WFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await wFilToETHPriceFeed.updateAnswer(
        wFilToETHRate.mul('110').div('100'),
      );

      const lendingInfoBefore = await lendingInfo.load('Before2', {
        WFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await expect(
        liquidator.executeLiquidationCall(
          hexETH,
          ethMaturities,
          hexWFIL,
          usdcMaturities[0],
          alice.address,
          10,
        ),
      ).to.emit(liquidationLogic, 'LiquidationExecuted');

      const lendingInfoAfter = await lendingInfo.load('After', {
        WFIL: filMaturities[0],
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
        WFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await wFilToETHPriceFeed.updateAnswer(
        wFilToETHRate.mul('110').div('100'),
      );

      const lendingInfoBefore = await lendingInfo.load('Before2', {
        WFIL: filMaturities[0],
        USDC: usdcMaturities[0],
      });

      await expect(
        liquidator.executeLiquidationCall(
          hexETH,
          ethMaturities,
          hexUSDC,
          usdcMaturities[0],
          alice.address,
          10,
        ),
      ).to.emit(liquidationLogic, 'LiquidationExecuted');

      const lendingInfoAfter = await lendingInfo.load('After', {
        WFIL: filMaturities[0],
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

  describe('Delisting', async () => {
    let decimals: BigNumber;
    let haircut: BigNumber;
    let priceFeeds: string[];
    let heartbeat: BigNumber;

    const addCurrency = async (currency: string) => {
      if (!(await currencyController.currencyExists(currency))) {
        await currencyController.addCurrency(
          currency,
          decimals,
          haircut,
          priceFeeds,
          heartbeat,
        );
      }
    };

    before(async () => {
      decimals = await currencyController.getDecimals(hexWFIL);
      haircut = await currencyController.getHaircut(hexWFIL);
      ({ instances: priceFeeds, heartbeat } =
        await currencyController.getPriceFeed(hexWFIL));
    });

    describe('Repay and redeem positions', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('2000000000000000000');
      const orderUnitPrice = '9600';

      let lendingInfo: LendingInfo;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(alice.address);
      });

      after(async () => {
        await addCurrency(hexWFIL);
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            orderUnitPrice,
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Delist a currency', async () => {
        await currencyController.removeCurrency(hexWFIL);

        expect(await currencyController.currencyExists(hexWFIL)).to.false;
      });

      it('Execute repayment & redemption', async () => {
        await lendingInfo.load('Before', {
          WFIL: filMaturities[0],
        });

        // Move to maturity date.
        await time.increaseTo(filMaturities[0].toString());

        await tokenVault
          .connect(alice)
          .deposit(
            hexWFIL,
            filledOrderAmount.mul(PCT_DIGIT).div(9600).sub(filledOrderAmount),
          );
        await lendingMarketController
          .connect(alice)
          .executeRepayment(hexWFIL, filMaturities[0]);

        // Move to 1 weeks after maturity.
        await time.increaseTo(filMaturities[0].add(604800).toString());

        await lendingMarketController
          .connect(bob)
          .executeRedemption(hexWFIL, filMaturities[0]);

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[0],
        });
        lendingInfo.show();

        expect(lendingInfoAfter.coverage).to.equal(0);
        expect(lendingInfoAfter.pvs[0]).to.equal(0);
        expect(lendingInfoAfter.filDeposit).to.equal(0);
      });
    });

    describe('Force a repayment of a borrowing position', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('2000000000000000000');
      const orderUnitPrice = '9600';

      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(alice.address);
      });

      after(async () => {
        await addCurrency(hexWFIL);
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            orderUnitPrice,
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute forced repayment', async () => {
        await lendingInfo.load('Before', {
          WFIL: filMaturities[0],
        });

        await time.increaseTo(filMaturities[0].toString());

        await expect(
          liquidator
            .connect(carol)
            .executeForcedRepayment(
              hexETH,
              ethMaturities,
              hexWFIL,
              filMaturities[0],
              alice.address,
              0,
            ),
        ).to.be.revertedWith('NotRepaymentPeriod');

        await currencyController.removeCurrency(hexWFIL);

        // Move to 1 weeks after maturity.
        await time.increaseTo(filMaturities[0].add(604800).toString());

        const receipt = await liquidator
          .connect(carol)
          .executeForcedRepayment(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            0,
          )
          .then((tx) => tx.wait());

        const {
          user,
          collateralCcy,
          debtCcy,
          debtMaturity,
          receivedDebtAmount,
        } = receipt.events.find(
          ({ event }) => event === 'OperationExecuteForDebt',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[0],
        });
        lendingInfo.show();

        const { futureValue: liquidatorFutureValue } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            liquidator.address,
          );
        const liquidatorDepositAmount = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETH);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[0]);
        expect(lendingInfoAfter.coverage).to.equal(0);
        expect(liquidatorFutureValue).to.equal(0);
        expect(liquidatorDepositAmount).not.equal(0);
        expect(receivedDebtAmount).to.equal(
          calculateFutureValue(filledOrderAmount, orderUnitPrice),
        );
      });
    });

    describe('Force a repayment of a insolvent borrowing position', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('2000000000000000000');
      const orderUnitPrice = '9600';

      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(alice.address);
      });

      after(async () => {
        await addCurrency(hexWFIL);
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            orderUnitPrice,
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute forced repayment', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul('3'));

        await lendingInfo.load('Before', {
          WFIL: filMaturities[0],
        });

        await time.increaseTo(filMaturities[0].toString());

        await expect(
          liquidator
            .connect(carol)
            .executeForcedRepayment(
              hexETH,
              ethMaturities,
              hexWFIL,
              filMaturities[0],
              alice.address,
              0,
            ),
        ).to.be.revertedWith('NotRepaymentPeriod');

        await currencyController.removeCurrency(hexWFIL);

        // Move to 1 weeks after maturity.
        await time.increaseTo(filMaturities[0].add(604800).toString());

        const receipt = await liquidator
          .connect(carol)
          .executeForcedRepayment(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[0],
            alice.address,
            0,
          )
          .then((tx) => tx.wait());

        const {
          user,
          collateralCcy,
          debtCcy,
          debtMaturity,
          receivedDebtAmount,
        } = receipt.events.find(
          ({ event }) => event === 'OperationExecuteForDebt',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[0],
        });
        lendingInfo.show();

        const { futureValue: liquidatorFutureValue } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[0],
            liquidator.address,
          );
        const liquidatorDepositAmount = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETH);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[0]);
        expect(lendingInfoAfter.coverage).to.equal(ethers.constants.MaxUint256);
        expect(liquidatorFutureValue).to.equal(0);
        expect(liquidatorDepositAmount).not.equal(0);
        expect(receivedDebtAmount).to.lt(
          calculateFutureValue(filledOrderAmount, orderUnitPrice),
        );
      });
    });

    describe('Force a repayment of a borrowing position after auto-roll', async () => {
      const filledOrderAmount = BigNumber.from('180000000000000000000');
      const depositAmount = BigNumber.from('2000000000000000000');
      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob] = await getUsers(2);
        await resetContractInstances();
      });

      after(async () => {
        await addCurrency(hexWFIL);
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            '9600',
          );
        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        await lendingMarketController
          .connect(owner)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            '10000000000000000000',
            '9599',
          );

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute auto-roll', async () => {
        await rotateAllMarkets();
      });

      it('Execute forced repayment', async () => {
        await lendingMarketController
          .connect(owner)
          .executeOrder(
            hexWFIL,
            filMaturities[1],
            Side.BORROW,
            filledOrderAmount.mul(2),
            '9600',
          );

        await lendingInfo.load('Before', {
          WFIL: filMaturities[1],
        });

        await currencyController.removeCurrency(hexWFIL);

        // Move to 1 weeks after maturity.
        await time.increaseTo(filMaturities[1].add(604800).toString());

        await expect(
          liquidator.executeForcedRepayment(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[1],
            alice.address,
            0,
          ),
        ).to.emit(liquidationLogic, 'ForcedRepaymentExecuted');

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[1],
        });
        lendingInfo.show();

        expect(lendingInfoAfter.coverage).to.equal(0);
        expect(lendingInfoAfter.pvs[0]).to.equal(0);
      });
    });

    describe('Force a repayment of a insolvent borrowing position after auto-roll', async () => {
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('2000000000000000000');
      const orderUnitPrice = '9600';

      let lendingInfo: LendingInfo;
      let aliceInitialBalance: BigNumber;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);
        await resetContractInstances();

        lendingInfo = new LendingInfo(alice.address);
      });

      after(async () => {
        await addCurrency(hexWFIL);
      });

      it('Create orders', async () => {
        lendingInfo = new LendingInfo(alice.address);
        aliceInitialBalance = await wFILToken.balanceOf(alice.address);

        await tokenVault.connect(alice).deposit(hexETH, depositAmount, {
          value: depositAmount,
        });
        await tokenVault.connect(owner).deposit(hexETH, depositAmount.mul(3), {
          value: depositAmount.mul(3),
        });

        await lendingMarketController
          .connect(alice)
          .executeOrder(
            hexWFIL,
            filMaturities[0],
            Side.BORROW,
            filledOrderAmount,
            orderUnitPrice,
          );

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              filMaturities[0],
              Side.LEND,
              filledOrderAmount,
              '0',
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        expect(
          await tokenVault.getDepositAmount(alice.address, hexWFIL),
        ).to.equal(filledOrderAmount);
      });

      it('Withdraw', async () => {
        await tokenVault
          .connect(alice)
          .withdraw(hexWFIL, '200000000000000000000');

        const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
        expect(aliceBalanceAfter.sub(aliceInitialBalance)).to.equal(
          filledOrderAmount,
        );
      });

      it('Execute auto-roll', async () => {
        await rotateAllMarkets();
      });

      it('Execute forced repayment', async () => {
        await wFilToETHPriceFeed.updateAnswer(wFilToETHRate.mul('3'));

        await lendingInfo.load('Before', {
          WFIL: filMaturities[1],
        });

        await time.increaseTo(filMaturities[1].toString());

        await expect(
          liquidator
            .connect(carol)
            .executeForcedRepayment(
              hexETH,
              ethMaturities,
              hexWFIL,
              filMaturities[1],
              alice.address,
              0,
            ),
        ).to.be.revertedWith('NotRepaymentPeriod');

        await currencyController.removeCurrency(hexWFIL);

        // Move to 1 weeks after maturity.
        await time.increaseTo(filMaturities[1].add(604800).toString());

        const receipt = await liquidator
          .connect(carol)
          .executeForcedRepayment(
            hexETH,
            ethMaturities,
            hexWFIL,
            filMaturities[1],
            alice.address,
            0,
          )
          .then((tx) => tx.wait());

        const {
          user,
          collateralCcy,
          debtCcy,
          debtMaturity,
          receivedDebtAmount,
        } = receipt.events.find(
          ({ event }) => event === 'OperationExecuteForDebt',
        ).args;

        const lendingInfoAfter = await lendingInfo.load('After', {
          WFIL: filMaturities[1],
        });
        lendingInfo.show();

        const { futureValue: liquidatorFutureValue } =
          await lendingMarketController.getPosition(
            hexWFIL,
            filMaturities[1],
            liquidator.address,
          );
        const liquidatorDepositAmount = await tokenVault.getDepositAmount(
          liquidator.address,
          hexWFIL,
        );

        expect(user).to.equal(alice.address);
        expect(collateralCcy).to.equal(hexETH);
        expect(debtCcy).to.equal(hexWFIL);
        expect(debtMaturity).to.equal(filMaturities[1]);
        expect(lendingInfoAfter.coverage).to.equal(ethers.constants.MaxUint256);
        expect(liquidatorFutureValue).to.equal(0);
        expect(liquidatorDepositAmount).not.equal(0);
        expect(receivedDebtAmount).to.lt(
          calculateFutureValue(filledOrderAmount, orderUnitPrice),
        );
      });
    });
  });
});
