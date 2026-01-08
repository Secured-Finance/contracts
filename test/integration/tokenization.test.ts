import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import moment from 'moment';
import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import {
  FULL_LIQUIDATION_THRESHOLD_RATE,
  HAIRCUT,
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PCT_DIGIT,
} from '../common/constants';
import { wFilToETHRate } from '../common/currencies';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Tokenization', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;
  let wFILToken: Contract;

  let fundManagementLogic: Contract;
  let lendingMarketOperationLogic: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  let signers: Signers;

  const initialUSDCBalance = BigNumber.from('10000000000');
  const initialWFILBalance = BigNumber.from('10000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await usdcToken
        .connect(owner)
        .transfer(signer.address, initialUSDCBalance);
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialWFILBalance);
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
      .executeOrder(hexETH, maturity, Side.BORROW, '1000000', unitPrice);

    await lendingMarketController
      .connect(user)
      .executeOrder(hexETH, maturity, Side.LEND, '1000000', unitPrice);
  };

  const executeAutoRoll = async (unitPrice: string, currency = hexETH) => {
    // Move to 6 hours (21600 sec) before maturity.
    await time.increaseTo(maturities[0].sub('21600').toString());
    await createSampleETHOrders(owner, maturities[1], unitPrice);

    await time.increaseTo(maturities[0].toString());
    await lendingMarketController.connect(owner).rotateOrderBooks(currency);

    await lendingMarketController
      .connect(owner)
      .executeItayoseCall(currency, maturities[maturities.length - 1]);
  };

  const resetContractInstances = async (currency = hexETH) => {
    maturities = await lendingMarketController.getMaturities(currency);
  };

  const initializeContracts = async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      currencyController,
      tokenVault,
      lendingMarketController,
      wETHToken,
      usdcToken,
      wFILToken,
      fundManagementLogic,
      lendingMarketOperationLogic,
    } = await deployContracts());

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      FULL_LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);

    // Deploy active Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexUSDC,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexETH,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate,
        genesisDate,
      );
    }

    maturities = await lendingMarketController.getMaturities(hexETH);

    // Deploy inactive Lending Markets for Itayose
    const preOpeningDate = maturities[0].sub(604800);
    await lendingMarketController.createOrderBook(
      hexUSDC,
      maturities[0],
      preOpeningDate,
    );
    await lendingMarketController.createOrderBook(
      hexETH,
      maturities[0],
      preOpeningDate,
    );
  };

  before('Deploy Contracts', async () => {
    await initializeContracts();
  });

  describe('Settings', async () => {
    it('Check ZC token info of ETH', async () => {
      const tokenAddress = await lendingMarketController.getZCToken(
        hexETH,
        maturities[0],
      );
      const tokenInfo = await lendingMarketController.getZCTokenInfo(
        tokenAddress,
      );
      const token = await ethers.getContractAt('ZCToken', tokenAddress);
      const maturity = moment(maturities[0].mul(1000).toNumber());

      expect(tokenInfo.ccy).to.equal(hexETH);
      expect(tokenInfo.maturity).to.equal(maturities[0]);
      expect(await token.decimals()).to.equal(await wETHToken.decimals());
      expect(await token.asset()).to.equal(wETHToken.address);
      expect(await token.maturity()).to.equal(maturities[0]);
      expect(await token.name()).to.equal(
        `ZC ETH ${maturity.format('MMMYYYY').toUpperCase()}`,
      );
      expect(await token.symbol()).to.equal(
        `zcETH-${maturity.format('YYYY-MM')}`,
      );
    });

    it('Check ZC perpetual token info of ETH', async () => {
      const tokenAddress = await lendingMarketController.getZCToken(hexETH, 0);
      const tokenInfo = await lendingMarketController.getZCTokenInfo(
        tokenAddress,
      );
      const token = await ethers.getContractAt('ZCToken', tokenAddress);

      expect(tokenInfo.ccy).to.equal(hexETH);
      expect(tokenInfo.maturity).to.equal(0);
      expect(await token.decimals()).to.equal(24);
      expect(await token.asset()).to.equal(wETHToken.address);
      expect(await token.maturity()).to.equal(0);
      expect(await token.name()).to.equal('ZC ETH');
      expect(await token.symbol()).to.equal('zcETH');
    });

    it('Check ZC token info of USDC', async () => {
      const tokenAddress = await lendingMarketController.getZCToken(
        hexUSDC,
        maturities[0],
      );
      const tokenInfo = await lendingMarketController.getZCTokenInfo(
        tokenAddress,
      );
      const token = await ethers.getContractAt('ZCToken', tokenAddress);
      const maturity = moment(maturities[0].mul(1000).toNumber());

      expect(tokenInfo.ccy).to.equal(hexUSDC);
      expect(tokenInfo.maturity).to.equal(maturities[0]);
      expect(await token.decimals()).to.equal(await usdcToken.decimals());
      expect(await token.asset()).to.equal(usdcToken.address);
      expect(await token.maturity()).to.equal(maturities[0]);
      expect(await token.name()).to.equal(
        `ZC USDC ${maturity.format('MMMYYYY').toUpperCase()}`,
      );
      expect(await token.symbol()).to.equal(
        `zcUSDC-${maturity.format('YYYY-MM')}`,
      );
    });

    it('Check ZC perpetual token info of USDC', async () => {
      const tokenAddress = await lendingMarketController.getZCToken(hexUSDC, 0);
      const tokenInfo = await lendingMarketController.getZCTokenInfo(
        tokenAddress,
      );
      const token = await ethers.getContractAt('ZCToken', tokenAddress);

      expect(tokenInfo.ccy).to.equal(hexUSDC);
      expect(tokenInfo.maturity).to.equal(0);
      expect(await token.decimals()).to.equal(24);
      expect(await token.asset()).to.equal(usdcToken.address);
      expect(await token.maturity()).to.equal(0);
      expect(await token.name()).to.equal('ZC USDC');
      expect(await token.symbol()).to.equal('zcUSDC');
    });
  });

  describe('Deposit and Withdraw in native currency (ETH)', async () => {
    describe('Withdraw and deposit ZC tokens by the same user', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFVBefore } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(aliceFVBefore);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], aliceFVBefore);

        expect(await zcToken.balanceOf(alice.address)).to.equal(aliceFVBefore);
        expect(await zcToken.totalSupply()).to.equal(aliceFVBefore);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(0);
      });

      it('Deposit ZC token', async () => {
        const balance = await zcToken.balanceOf(alice.address);
        await lendingMarketController
          .connect(alice)
          .depositZCToken(hexETH, maturities[0], balance);

        expect(await zcToken.balanceOf(alice.address)).to.equal(0);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(balance);
        expect(await zcToken.totalSupply()).to.equal(0);
      });
    });

    describe('Withdraw and deposit ZC tokens by the different user', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFVBefore } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], aliceFVBefore);

        expect(await zcToken.balanceOf(alice.address)).to.equal(aliceFVBefore);
        expect(await zcToken.totalSupply()).to.equal(aliceFVBefore);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(0);
      });

      it('Transfer ZC token', async () => {
        const aliceBalanceBefore = await zcToken.balanceOf(alice.address);

        await zcToken
          .connect(alice)
          .transfer(carol.address, aliceBalanceBefore);

        const aliceBalance = await zcToken.balanceOf(alice.address);
        const carolBalance = await zcToken.balanceOf(carol.address);

        expect(aliceBalance).to.equal(0);
        expect(carolBalance).to.equal(aliceBalanceBefore);
        expect(await zcToken.totalSupply()).to.equal(aliceBalanceBefore);
      });

      it('Deposit ZC token', async () => {
        const balance = await zcToken.balanceOf(carol.address);
        await lendingMarketController
          .connect(carol)
          .depositZCToken(hexETH, maturities[0], balance);

        expect(await zcToken.balanceOf(carol.address)).to.equal(0);

        const { futureValue: carolFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            carol.address,
          );

        expect(carolFVAfter).to.equal(balance);
        expect(await zcToken.totalSupply()).to.equal(0);
      });
    });

    describe('Withdraw and deposit ZC perpetual tokens by the same user', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcPerpetualToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();

        zcPerpetualToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, 0),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Execute auto roll', async () => {
        // Auto-roll
        await executeAutoRoll('9600');

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(0);
      });

      it('Withdraw ZC perpetual token', async () => {
        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );
        const { amount: aliceGVBefore, amountInFV: aliceGVInFV } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceFV).to.equal(aliceGVInFV);
        expect(aliceGVInFV.toString().length + 8).to.equal(
          aliceGVBefore.toString().length,
        );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            0,
            alice.address,
          );

        expect(withdrawableAmount).to.equal(aliceGVBefore);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, 0, aliceGVBefore);

        expect(await zcPerpetualToken.balanceOf(alice.address)).to.equal(
          aliceGVBefore,
        );
        expect(await zcPerpetualToken.totalSupply()).to.equal(aliceGVBefore);

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceGVAfter).to.equal(0);
      });

      it('Deposit ZC perpetual token', async () => {
        const balance = await zcPerpetualToken.balanceOf(alice.address);
        await lendingMarketController
          .connect(alice)
          .depositZCToken(hexETH, 0, balance);

        expect(await zcPerpetualToken.balanceOf(alice.address)).to.equal(0);
        expect(await zcPerpetualToken.totalSupply()).to.equal(0);

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceGVAfter).to.equal(balance);
      });
    });

    describe('Withdraw and deposit ZC perpetual tokens by the different user', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcPerpetualToken: Contract;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);

        await resetContractInstances();

        zcPerpetualToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, 0),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Execute auto roll', async () => {
        // Auto-roll
        await executeAutoRoll('9600');

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(0);
      });

      it('Withdraw ZC perpetual token', async () => {
        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );
        const { amount: aliceGVBefore, amountInFV: aliceGVInFV } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceFV).to.equal(aliceGVInFV);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, 0, aliceGVBefore);

        expect(await zcPerpetualToken.balanceOf(alice.address)).to.equal(
          aliceGVBefore,
        );
        expect(await zcPerpetualToken.totalSupply()).to.equal(aliceGVBefore);

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceGVAfter).to.equal(0);
      });

      it('Transfer ZC perpetual token', async () => {
        const aliceBalanceBefore = await zcPerpetualToken.balanceOf(
          alice.address,
        );

        await zcPerpetualToken
          .connect(alice)
          .transfer(carol.address, aliceBalanceBefore);

        const aliceBalance = await zcPerpetualToken.balanceOf(alice.address);
        const carolBalance = await zcPerpetualToken.balanceOf(carol.address);

        expect(aliceBalance).to.equal(0);
        expect(carolBalance).to.equal(aliceBalanceBefore);
        expect(await zcPerpetualToken.totalSupply()).to.equal(
          aliceBalanceBefore,
        );
      });

      it('Deposit ZC perpetual token', async () => {
        const balance = await zcPerpetualToken.balanceOf(carol.address);
        await lendingMarketController
          .connect(carol)
          .depositZCToken(hexETH, 0, balance);

        expect(await zcPerpetualToken.balanceOf(carol.address)).to.equal(0);
        expect(await zcPerpetualToken.totalSupply()).to.equal(0);

        const { amount: carolGVAfter } =
          await lendingMarketController.getGenesisValue(hexETH, carol.address);

        expect(carolGVAfter).to.equal(balance);
      });
    });

    describe('Deposit ZC tokens after maturity date', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;
      let zcPerpetualToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
        zcPerpetualToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, 0),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFVBefore } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], aliceFVBefore);

        const balance = await zcToken.balanceOf(alice.address);
        expect(balance).to.equal(aliceFVBefore);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(0);
      });

      it('Execute auto roll', async () => {
        // Auto-roll
        await executeAutoRoll('9600');

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(0);
      });

      it('Deposit ZC token', async () => {
        const balance = await zcToken.balanceOf(alice.address);
        await lendingMarketController
          .connect(alice)
          .depositZCToken(hexETH, maturities[0], balance);

        expect(await zcToken.balanceOf(alice.address)).to.equal(0);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(0);

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceGVAfter).to.not.equal(0);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );
        const { amount: aliceGVBefore, amountInFV: aliceGVInFV } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceFV).to.equal(aliceGVInFV);

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            0,
            alice.address,
          );

        expect(withdrawableAmount).to.equal(aliceGVBefore);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, 0, aliceGVBefore);

        expect(await zcPerpetualToken.balanceOf(alice.address)).to.equal(
          aliceGVBefore,
        );

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexETH, alice.address);

        expect(aliceGVAfter).to.equal(0);
      });
    });

    describe('Withdraw ZC tokens with deposits after using as collateral', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Fill an order using ZC bonds', async () => {
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              orderAmount.div(2),
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              orderAmount.div(2),
              0,
              { value: orderAmount.div(2) },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        expect(alicePV.abs()).to.equal(orderAmount.div(2));
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).lt(alicePV);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], withdrawableAmount);

        const coverage = await tokenVault.getCoverage(alice.address);
        expect(coverage.sub('7999').abs()).lte(1);

        const balance = await zcToken.balanceOf(alice.address);
        expect(balance).to.equal(withdrawableAmount);

        const withdrawableAmountAfter =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );
        expect(withdrawableAmountAfter).to.equal(0);
      });
    });

    describe('Withdraw ZC tokens with additional deposits after using as collateral', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Fill an order using ZC bonds', async () => {
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              orderAmount.div(2),
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              orderAmount.div(2),
              0,
              { value: orderAmount.div(2) },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        expect(alicePV.abs()).to.equal(orderAmount.div(2));
      });

      it('Deposit additional collateral', async () => {
        await tokenVault.connect(alice).deposit(hexETH, orderAmount.div(2), {
          value: orderAmount.div(2),
        });

        const deposit = await tokenVault.getDepositAmount(
          alice.address,
          hexETH,
        );
        expect(deposit).to.equal(orderAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(alicePV);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], withdrawableAmount);

        const coverage = await tokenVault.getCoverage(alice.address);
        expect(coverage.sub('5000').abs()).lte(1);

        const balance = await zcToken.balanceOf(alice.address);
        expect(balance).to.equal(withdrawableAmount);

        const withdrawableAmountAfter =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );
        expect(withdrawableAmountAfter).to.equal(0);
      });
    });

    describe('Withdraw ZC tokens without deposits after using as collateral', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Fill an order using ZC bonds', async () => {
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              orderAmount.div(2),
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              orderAmount.div(2),
              0,
              { value: orderAmount.div(2) },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        expect(alicePV.abs()).to.equal(orderAmount.div(2));
      });

      it('Withdraw borrowed collateral', async () => {
        const withdrawableAmount = await tokenVault[
          'getWithdrawableCollateral(bytes32,address)'
        ](hexETH, alice.address);

        expect(withdrawableAmount).to.equal(orderAmount.div(2));

        await expect(
          tokenVault.connect(alice).withdraw(hexETH, withdrawableAmount),
        )
          .to.emit(tokenVault, 'Withdraw')
          .withArgs(alice.address, hexETH, withdrawableAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        const { futureValue: alicePV2 } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(
          alicePV2
            .abs()
            .mul(PCT_DIGIT)
            .div(alicePV.sub(withdrawableAmount))
            .sub('7999'),
        ).lte(1);

        expect(withdrawableAmount).lt(alicePV);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], withdrawableAmount);

        const coverage = await tokenVault.getCoverage(alice.address);
        expect(coverage.sub('7999').abs()).lte(1);

        const balance = await zcToken.balanceOf(alice.address);
        expect(balance).to.equal(withdrawableAmount);

        const withdrawableAmountAfter =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );
        expect(withdrawableAmountAfter).to.equal(0);
      });
    });

    describe('Withdraw full ZC tokens with haircut = 0', async () => {
      const lendAmount = BigNumber.from('100000000000000000'); // 0.1 ETH LEND
      const borrowAmount = BigNumber.from('10000000000000000'); // 0.01 ETH BORROW (10% of LEND)

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();
        await currencyController.updateHaircut(hexETH, 0);
      });

      after(async () => {
        await currencyController.updateHaircut(hexETH, HAIRCUT);
      });

      it('Create LEND position for alice', async () => {
        // Alice deposits and creates a LEND order
        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              lendAmount,
              9600,
              { value: lendAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        // Bob deposits and creates a BORROW order that matches Alice's LEND order
        await tokenVault.connect(bob).deposit(hexETH, lendAmount.mul(2), {
          value: lendAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, lendAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceLendPV, futureValue: aliceLendFV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceLendPV).to.equal(lendAmount);
        expect(aliceLendFV).to.be.gt(0);
      });

      it('Create small BORROW position for alice (smaller than LEND)', async () => {
        // Alice creates a BORROW order
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              borrowAmount,
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        // Bob creates a LEND order that matches Alice's BORROW order
        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              borrowAmount,
              0,
              { value: borrowAmount },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceBorrowPV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        expect(aliceBorrowPV.abs()).to.equal(borrowAmount);
      });

      it('Withdraw ZC tokens with the withdrawable amount (haircut = 0 path)', async () => {
        const { futureValue: aliceLendFVBefore } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        const withdrawableAmountBefore =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        // With haircut = 0, the withdrawable amount should include full unallocated collateral
        expect(withdrawableAmountBefore).to.be.gt(0);

        // Withdraw the withdrawable amount
        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], withdrawableAmountBefore);

        const { futureValue: aliceLendFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        // Verify the position decreased by the withdrawn amount
        expect(aliceLendFVBefore.sub(aliceLendFVAfter)).to.equal(
          withdrawableAmountBefore,
        );
      });

      it('Verify no withdrawable ZC tokens remain', async () => {
        const withdrawableAmountAfter =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmountAfter).to.equal(0);
      });
    });

    describe('Withdraw full ZC tokens with sufficient collateral and small BORROW position', async () => {
      const lendAmount = BigNumber.from('100000000000000000'); // 0.1 ETH LEND
      const borrowAmount = BigNumber.from('10000000000000000'); // 0.01 ETH BORROW (10% of LEND)

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();
      });

      it('Create LEND position for alice', async () => {
        // Alice deposits and creates a LEND order
        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              lendAmount,
              9600,
              { value: lendAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        // Bob deposits and creates a BORROW order that matches Alice's LEND order
        await tokenVault.connect(bob).deposit(hexETH, lendAmount.mul(2), {
          value: lendAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, lendAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceLendPV, futureValue: aliceLendFV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceLendPV).to.equal(lendAmount);
        expect(aliceLendFV).to.be.gt(0);
      });

      it('Create small BORROW position for alice (smaller than LEND)', async () => {
        // Alice creates a BORROW order
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              borrowAmount,
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        // Bob creates a LEND order that matches Alice's BORROW order
        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              borrowAmount,
              0,
              { value: borrowAmount },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceBorrowPV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        expect(aliceBorrowPV.abs()).to.equal(borrowAmount);
      });

      it('Verify alice has low coverage ratio (sufficient collateral)', async () => {
        const coverage = await tokenVault.getCoverage(alice.address);

        // Coverage should be low (around 15-20%), indicating sufficient collateral
        // but NOT enough to withdraw 100% due to the bug
        expect(coverage).to.be.lt(2000); // Less than 20%
      });

      it('Withdraw ZC tokens with the withdrawable amount', async () => {
        const { futureValue: aliceLendFVBefore } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        const withdrawableAmountBefore =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        // Withdraw the withdrawable amount
        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], withdrawableAmountBefore);

        const { futureValue: aliceLendFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        // Verify the position decreased by the withdrawn amount
        expect(aliceLendFVBefore.sub(aliceLendFVAfter)).to.equal(
          withdrawableAmountBefore,
        );
      });

      it('Verify no withdrawable ZC tokens remain', async () => {
        const withdrawableAmountAfter =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );
        const coverage = await tokenVault.getCoverage(alice.address);

        expect(withdrawableAmountAfter).to.equal(0);
        expect(coverage).to.equal(8000);
      });
    });

    describe('Withdraw ZC tokens with big BORROW position causing high PV', async () => {
      const lendAmount = BigNumber.from('100000000000000000'); // 0.1 ETH LEND
      const borrowAmount = BigNumber.from('80000000000000000'); // 0.08 ETH BORROW (80% of LEND)
      const tradeAmount = BigNumber.from('1000000000000000000'); // 1 ETH per trade

      let carol: SignerWithAddress;

      before(async () => {
        [alice, bob, carol] = await getUsers(3);

        await resetContractInstances();
      });

      it('Create LEND position for alice', async () => {
        // Alice deposits and creates a LEND order
        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              lendAmount,
              9600,
              { value: lendAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        // Bob deposits and creates a BORROW order that matches Alice's LEND order
        await tokenVault.connect(bob).deposit(hexETH, lendAmount.mul(2), {
          value: lendAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, lendAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceLendPV, futureValue: aliceLendFV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceLendPV).to.equal(lendAmount);
        expect(aliceLendFV).to.be.gt(0);
      });

      it('Create big BORROW position for alice', async () => {
        // Alice creates a BORROW order
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              borrowAmount,
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        // Bob creates a LEND order that matches Alice's BORROW order
        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              borrowAmount,
              0,
              { value: borrowAmount },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceBorrowPV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        expect(aliceBorrowPV.abs()).to.equal(borrowAmount);
      });

      it('Withdraw borrowed collateral to lower coverage ratio', async () => {
        await tokenVault.connect(alice).withdraw(hexETH, borrowAmount);
      });

      it('Increase unitPrice by executing multiple orders to increase BORROW position PV', async () => {
        // Carol deposits funds for trading
        await tokenVault.connect(carol).deposit(hexETH, tradeAmount.mul(2), {
          value: tradeAmount.mul(2),
        });

        // Execute multiple trades to increase unitPrice
        await expect(
          lendingMarketController
            .connect(carol)
            .executeOrder(
              hexETH,
              maturities[1],
              Side.BORROW,
              tradeAmount,
              9900,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexETH,
              maturities[1],
              Side.LEND,
              tradeAmount,
              0,
              { value: tradeAmount },
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        const { presentValue: aliceBorrowPV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[1],
            alice.address,
          );

        // BORROW PV should have increased due to higher unitPrice
        expect(aliceBorrowPV.abs()).to.be.gt(borrowAmount);

        const coverage = await tokenVault.getCoverage(alice.address);
        expect(coverage).to.be.gt(8000); // Coverage should be above 80%
      });

      it('Verify withdrawableAmount is 0 due to increased BORROW position PV', async () => {
        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexETH,
            maturities[0],
            alice.address,
          );

        // Due to the increased BORROW position PV, withdrawableAmount should be 0
        expect(withdrawableAmount).to.equal(
          0,
          'withdrawableAmount should be 0 due to increased BORROW position PV',
        );
      });
    });

    describe('Deposit ZC tokens after the emergency termination', async () => {
      const orderAmount = BigNumber.from('100000000000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances();

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexETH, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await tokenVault.connect(bob).deposit(hexETH, orderAmount.mul(2), {
          value: orderAmount.mul(2),
        });

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexETH,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
              { value: orderAmount },
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexETH, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFVBefore } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexETH, maturities[0], aliceFVBefore);

        const balance = await zcToken.balanceOf(alice.address);
        expect(balance).to.equal(aliceFVBefore);
      });

      it('Execute emergency termination', async () => {
        await expect(
          lendingMarketController.executeEmergencyTermination(),
        ).to.emit(lendingMarketOperationLogic, 'EmergencyTerminationExecuted');
      });

      it('Deposit ZC token', async () => {
        const aliceTotalPVBefore =
          await lendingMarketController.getTotalPresentValue(
            hexETH,
            alice.address,
          );

        expect(aliceTotalPVBefore).to.equal(0);

        const balance = await zcToken.balanceOf(alice.address);
        await lendingMarketController
          .connect(alice)
          .depositZCToken(hexETH, maturities[0], balance);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexETH,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(balance);

        const aliceTotalPVAfter =
          await lendingMarketController.getTotalPresentValue(
            hexETH,
            alice.address,
          );

        expect(aliceTotalPVAfter).to.equal(orderAmount);
      });

      it('Fail to withdraw ZC token', async () => {
        await expect(
          lendingMarketController
            .connect(alice)
            .withdrawZCToken(hexETH, maturities[0], '1'),
        ).to.be.revertedWith('MarketTerminated');
      });

      it('Execute forced redemption', async () => {
        const alicePV =
          await lendingMarketController.getTotalPresentValueInBaseCurrency(
            alice.address,
          );

        await expect(
          lendingMarketController.connect(alice).executeEmergencySettlement(),
        )
          .to.emit(fundManagementLogic, 'EmergencySettlementExecuted')
          .withArgs(alice.address, alicePV);
      });
    });
  });

  describe('Deposit and Withdraw in a collateral currency token (USDC)', async () => {
    before(async () => {
      await initializeContracts();
    });

    describe('Withdraw and deposit ZC tokens by the same user', async () => {
      const orderAmount = BigNumber.from('1000000000');
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances(hexUSDC);
        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexUSDC, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        await usdcToken
          .connect(alice)
          .approve(tokenVault.address, orderAmount.mul(2));
        await usdcToken
          .connect(bob)
          .approve(tokenVault.address, orderAmount.mul(2));
        await tokenVault.connect(bob).deposit(hexUSDC, orderAmount.mul(2), {});

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexUSDC,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexUSDC, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFVBefore } =
          await lendingMarketController.getPosition(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(aliceFVBefore);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexUSDC, maturities[0], aliceFVBefore);

        expect(await zcToken.balanceOf(alice.address)).to.equal(aliceFVBefore);
        expect(await zcToken.totalSupply()).to.equal(aliceFVBefore);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(0);
      });

      it('Deposit ZC token', async () => {
        const balance = await zcToken.balanceOf(alice.address);
        await lendingMarketController
          .connect(alice)
          .depositZCToken(hexUSDC, maturities[0], balance);

        expect(await zcToken.balanceOf(alice.address)).to.equal(0);

        const { futureValue: aliceFVAfter } =
          await lendingMarketController.getPosition(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        expect(aliceFVAfter).to.equal(balance);
        expect(await zcToken.totalSupply()).to.equal(0);
      });
    });

    describe('Withdraw and deposit ZC perpetual tokens by the same user', async () => {
      const orderAmount = BigNumber.from('1000000000');
      let zcPerpetualToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        await resetContractInstances(hexUSDC);
        zcPerpetualToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexUSDC, 0),
        );
      });

      it('Fill an order', async () => {
        await usdcToken
          .connect(alice)
          .approve(tokenVault.address, orderAmount.mul(2));
        await usdcToken
          .connect(bob)
          .approve(tokenVault.address, orderAmount.mul(2));
        await tokenVault.connect(bob).deposit(hexUSDC, orderAmount.mul(2));

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexUSDC,
              maturities[0],
              Side.LEND,
              orderAmount,
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(hexUSDC, maturities[0], Side.BORROW, orderAmount, 0),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmount);
      });

      it('Execute auto roll', async () => {
        // Auto-roll
        await executeAutoRoll('9600', hexUSDC);

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexUSDC,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(0);
      });

      it('Withdraw ZC perpetual token', async () => {
        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexUSDC,
            maturities[1],
            alice.address,
          );
        const { amount: aliceGVBefore, amountInFV: aliceGVInFV } =
          await lendingMarketController.getGenesisValue(hexUSDC, alice.address);

        expect(aliceFV).to.equal(aliceGVInFV);
        expect(aliceGVInFV.toString().length + 20).to.equal(
          aliceGVBefore.toString().length,
        );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexUSDC,
            0,
            alice.address,
          );

        expect(withdrawableAmount).to.equal(aliceGVBefore);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexUSDC, 0, aliceGVBefore);

        expect(await zcPerpetualToken.balanceOf(alice.address)).to.equal(
          aliceGVBefore,
        );
        expect(await zcPerpetualToken.totalSupply()).to.equal(aliceGVBefore);

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexUSDC, alice.address);

        expect(aliceGVAfter).to.equal(0);
      });

      it('Deposit ZC perpetual token', async () => {
        const balance = await zcPerpetualToken.balanceOf(alice.address);
        await lendingMarketController
          .connect(alice)
          .depositZCToken(hexUSDC, 0, balance);

        expect(await zcPerpetualToken.balanceOf(alice.address)).to.equal(0);
        expect(await zcPerpetualToken.totalSupply()).to.equal(0);

        const { amount: aliceGVAfter } =
          await lendingMarketController.getGenesisValue(hexUSDC, alice.address);

        expect(aliceGVAfter).to.equal(balance);
      });
    });
  });

  describe('Deposit and Withdraw in a non-collateral currency token (FIL)', async () => {
    before(async () => {
      await initializeContracts();
    });

    describe('Withdraw ZC tokens without deposits after using as collateral', async () => {
      const orderAmountInFIL = BigNumber.from('100000000000000000');
      const orderAmountInETH = orderAmountInFIL
        .mul(wFilToETHRate)
        .div(BigNumber.from(10).pow(18));
      let zcToken: Contract;

      before(async () => {
        [alice, bob] = await getUsers(2);

        zcToken = await ethers.getContractAt(
          'ZCToken',
          await lendingMarketController.getZCToken(hexWFIL, maturities[0]),
        );
      });

      it('Fill an order', async () => {
        // Bob deposits ETH as collateral and WFIL for lending
        await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH.mul(2), {
          value: orderAmountInETH.mul(2),
        });
        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, orderAmountInFIL.mul(2));
        await tokenVault.connect(bob).deposit(hexWFIL, orderAmountInFIL.mul(2));

        await wFILToken
          .connect(alice)
          .approve(tokenVault.address, orderAmountInFIL);

        await expect(
          lendingMarketController
            .connect(alice)
            .depositAndExecuteOrder(
              hexWFIL,
              maturities[0],
              Side.LEND,
              orderAmountInFIL,
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await expect(
          lendingMarketController
            .connect(bob)
            .executeOrder(
              hexWFIL,
              maturities[0],
              Side.BORROW,
              orderAmountInFIL,
              0,
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV, futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[0],
            alice.address,
          );

        expect(alicePV).to.equal(orderAmountInFIL);

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexWFIL,
            maturities[0],
            alice.address,
          );

        expect(withdrawableAmount).to.equal(aliceFV);
      });

      it('Fill an order using ZC bonds', async () => {
        await expect(
          lendingMarketController
            .connect(alice)
            .executeOrder(
              hexWFIL,
              maturities[1],
              Side.BORROW,
              orderAmountInFIL.div(2),
              9600,
            ),
        ).to.not.emit(fundManagementLogic, 'OrderFilled');

        await wFILToken
          .connect(bob)
          .approve(tokenVault.address, orderAmountInFIL.div(2));

        await expect(
          lendingMarketController
            .connect(bob)
            .depositAndExecuteOrder(
              hexWFIL,
              maturities[1],
              Side.LEND,
              orderAmountInFIL.div(2),
              0,
            ),
        ).to.emit(fundManagementLogic, 'OrderFilled');

        // Check future value
        const { presentValue: alicePV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[1],
            alice.address,
          );

        expect(alicePV.abs()).to.equal(orderAmountInFIL.div(2));
      });

      it('Withdraw borrowed collateral', async () => {
        const withdrawableAmount = await tokenVault[
          'getWithdrawableCollateral(bytes32,address)'
        ](hexWFIL, alice.address);

        expect(withdrawableAmount).to.equal(orderAmountInFIL.div(2));

        await expect(
          tokenVault.connect(alice).withdraw(hexWFIL, withdrawableAmount),
        )
          .to.emit(tokenVault, 'Withdraw')
          .withArgs(alice.address, hexWFIL, withdrawableAmount);
      });

      it('Withdraw ZC token', async () => {
        const { futureValue: aliceFV } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[0],
            alice.address,
          );

        const { futureValue: aliceFV2 } =
          await lendingMarketController.getPosition(
            hexWFIL,
            maturities[1],
            alice.address,
          );

        const withdrawableAmount =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexWFIL,
            maturities[0],
            alice.address,
          );

        expect(
          aliceFV2
            .abs()
            .mul(PCT_DIGIT)
            .div(aliceFV.sub(withdrawableAmount))
            .sub('7999'),
        ).lte(1);

        expect(withdrawableAmount).lt(aliceFV);

        await lendingMarketController
          .connect(alice)
          .withdrawZCToken(hexWFIL, maturities[0], withdrawableAmount);

        const coverage = await tokenVault.getCoverage(alice.address);
        expect(coverage.sub('7999').abs()).lte(1);

        const balance = await zcToken.balanceOf(alice.address);
        expect(balance).to.equal(withdrawableAmount);

        const withdrawableAmountAfter =
          await lendingMarketController.getWithdrawableZCTokenAmount(
            hexWFIL,
            maturities[0],
            alice.address,
          );
        expect(withdrawableAmountAfter).to.equal(0);
      });
    });
  });
});
