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
import { filToETHRate } from '../../utils/numbers';
import { hexETHString, hexFILString } from '../../utils/strings';

describe('Integration Test: Liquidations', async () => {
  let owner: SignerWithAddress;
  let singers: SignerWithAddress[];

  let addressResolver: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let filToETHPriceFeed: Contract;
  let mockSwapRouter: Contract;

  let lendingMarkets: Contract[] = [];
  let maturities: BigNumber[];

  class LendingInfo {
    private address: string;
    private log: Record<string, any> = {};

    constructor(address: string) {
      this.address = address;
    }

    async load(label: string, maturity: BigNumber) {
      const [coverage, pv, filDeposit, ethDeposit] = await Promise.all([
        tokenVault.getCoverage(this.address),
        lendingMarketController.getPresentValue(
          hexFILString,
          maturity,
          this.address,
        ),
        tokenVault.getDepositAmount(this.address, hexFILString),
        tokenVault.getDepositAmount(this.address, hexETHString),
      ]);
      this.log[label] = {
        Maturity: maturity.toNumber(),
        Coverage: coverage.toString(),
        'PV(FIL)': pv.toString(),
        'Deposit(FIL)': filDeposit.toString(),
        'Deposit(ETH)': ethDeposit.toString(),
      };
      return { coverage, pv, filDeposit, ethDeposit };
    }

    show() {
      console.table(this.log);
    }
  }

  before('Deploy Contracts', async () => {
    [owner, ...singers] = await ethers.getSigners();

    ({
      addressResolver,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wFILToken,
      filToETHPriceFeed,
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
    await tokenVault.updateCurrency(hexFILString, false);

    for (const { address } of [owner, ...singers, mockSwapRouter]) {
      await wFILToken
        .connect(owner)
        .transfer(address, '1000000000000000000000');
    }

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexFILString)
        .then((tx) => tx.wait());
    }

    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexFILString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );

    for (const signer of [owner, ...singers]) {
      await wFILToken
        .connect(signer)
        .approve(tokenVault.address, ethers.constants.MaxUint256);
    }

    await tokenVault.connect(owner).deposit(hexETHString, '10000000000', {
      value: '100000000000000000000',
    });
  });

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexFILString);

    await lendingMarketController
      .connect(owner)
      .createOrder(
        hexFILString,
        maturities[1],
        Side.BORROW,
        '1000000000',
        '7990',
      );

    await lendingMarketController
      .connect(owner)
      .depositAndCreateOrder(
        hexFILString,
        maturities[1],
        Side.LEND,
        '1000000000',
        '8010',
      );

    await time.increaseTo(maturities[0].toString());

    await lendingMarketController
      .connect(owner)
      .rotateLendingMarkets(hexFILString);

    await lendingMarketController
      .connect(owner)
      .cancelOrder(hexFILString, maturities[1], '1');
    await lendingMarketController
      .connect(owner)
      .cancelOrder(hexFILString, maturities[1], '2');

    maturities = await lendingMarketController.getMaturities(hexFILString);
    await filToETHPriceFeed.updateAnswer(filToETHRate);
  });

  describe('Liquidations on FIL market by ETH', async () => {
    it('Order in the order book is taken, Increase FIL exchange rate by 10%, Liquidate it once', async () => {
      const alice = singers[0];
      const bob = singers[1];

      const lendingInfo = new LendingInfo(alice.address);
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');

      const aliceBalanceBefore = await wFILToken.balanceOf(alice.address);

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
          maturities[0],
          Side.BORROW,
          filledOrderAmount,
          '8000',
        );
      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          filledOrderAmount.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            filledOrderAmount,
            '0',
          ),
      ).to.emit(lendingMarketController, 'FillOrder');

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.LEND,
          '10000000000000000000',
          '8001',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexFILString),
      ).to.equal(filledOrderAmount);

      await tokenVault
        .connect(alice)
        .withdraw(hexFILString, '200000000000000000000');

      const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.equal(
        filledOrderAmount,
      );

      await filToETHPriceFeed.updateAnswer(filToETHRate.mul('110').div('100'));

      const lendingInfoBefore = await lendingInfo.load('Before', maturities[0]);

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          0,
          alice.address,
          10,
        ),
      )
        .to.emit(lendingMarketController, 'Liquidate')
        .withArgs(
          alice.address,
          hexETHString,
          hexFILString,
          maturities[0],
          filledOrderAmount.div(2),
        );

      const lendingInfoAfter = await lendingInfo.load('After', maturities[0]);
      lendingInfo.show();

      expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to.true;
      expect(lendingInfoAfter.pv).to.equal(lendingInfoBefore.pv.div(2));

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          0,
          alice.address,
          10,
        ),
      ).to.be.revertedWith('User has enough collateral');
    });

    it('Take an order from the order book, Increase FIL exchange rate by 10%, Liquidate it once', async () => {
      const alice = singers[2];
      const bob = singers[3];

      const lendingInfo = new LendingInfo(alice.address);
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');

      const aliceBalanceBefore = await wFILToken.balanceOf(alice.address);

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
          maturities[0],
          Side.LEND,
          filledOrderAmount,
          '8000',
        );

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.LEND,
          '10000000000000000000',
          '8001',
        );

      await expect(
        lendingMarketController
          .connect(alice)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            filledOrderAmount,
            '0',
          ),
      ).to.emit(lendingMarketController, 'FillOrder');

      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          filledOrderAmount.mul(2),
          '8000',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexFILString),
      ).to.equal(filledOrderAmount);

      await tokenVault
        .connect(alice)
        .withdraw(hexFILString, '200000000000000000000');

      const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.equal(
        filledOrderAmount,
      );

      await filToETHPriceFeed.updateAnswer(filToETHRate.mul('110').div('100'));

      const lendingInfoBefore = await lendingInfo.load('Before', maturities[0]);

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          0,
          alice.address,
          10,
        ),
      )
        .to.emit(lendingMarketController, 'Liquidate')
        .withArgs(
          alice.address,
          hexETHString,
          hexFILString,
          maturities[0],
          filledOrderAmount.div(2),
        );

      const lendingInfoAfter = await lendingInfo.load('After', maturities[0]);
      lendingInfo.show();

      expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to.true;
      expect(lendingInfoAfter.pv).to.equal(lendingInfoBefore.pv.div(2));
    });

    it('Increase FIL exchange rate by 20%, Liquidate it twice', async () => {
      const alice = singers[4];
      const bob = singers[5];

      const lendingInfo = new LendingInfo(alice.address);
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');

      const aliceBalanceBefore = await wFILToken.balanceOf(alice.address);

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
          maturities[0],
          Side.BORROW,
          filledOrderAmount,
          '8000',
        );
      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          filledOrderAmount.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            filledOrderAmount,
            '0',
          ),
      ).to.emit(lendingMarketController, 'FillOrder');

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.LEND,
          '10000000000000000000',
          '8001',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexFILString),
      ).to.equal(filledOrderAmount);

      await tokenVault
        .connect(alice)
        .withdraw(hexFILString, '200000000000000000000');

      const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.equal(
        filledOrderAmount,
      );

      await filToETHPriceFeed.updateAnswer(filToETHRate.mul('120').div('100'));

      const lendingInfoBefore = await lendingInfo.load('Before', maturities[0]);

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          0,
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'Liquidate');

      const lendingInfoAfter1 = await lendingInfo.load('After1', maturities[0]);

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          0,
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'Liquidate');

      const lendingInfoAfter2 = await lendingInfo.load('After2', maturities[0]);
      lendingInfo.show();

      expect(lendingInfoAfter1.coverage.lt(lendingInfoBefore.coverage)).to.true;
      expect(lendingInfoAfter2.coverage.lt(lendingInfoAfter1.coverage)).to.true;
      expect(lendingInfoAfter1.pv).to.equal(lendingInfoBefore.pv.div(2));
      expect(lendingInfoAfter2.pv).to.equal(lendingInfoAfter1.pv.div(2));

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          0,
          alice.address,
          10,
        ),
      ).to.be.revertedWith('User has enough collateral');
    });

    it('Roll a borrowing position by 25% rate, Liquidate it', async () => {
      const alice = singers[6];
      const bob = singers[7];

      const lendingInfo = new LendingInfo(alice.address);
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');

      const aliceBalanceBefore = await wFILToken.balanceOf(alice.address);

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
          maturities[0],
          Side.BORROW,
          filledOrderAmount,
          '8000',
        );
      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          filledOrderAmount.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            filledOrderAmount,
            '0',
          ),
      ).to.emit(lendingMarketController, 'FillOrder');

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.LEND,
          '10000000000000000000',
          '8001',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexFILString),
      ).to.equal(filledOrderAmount);

      await tokenVault
        .connect(alice)
        .withdraw(hexFILString, '200000000000000000000');

      const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.equal(
        filledOrderAmount,
      );

      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[1],
          Side.BORROW,
          '1000000000',
          '7999',
        );

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[1],
          Side.LEND,
          '1000000000',
          '8001',
        );

      await time.increaseTo(maturities[0].toString());
      await lendingMarketController
        .connect(owner)
        .rotateLendingMarkets(hexFILString);

      const lendingInfoBefore = await lendingInfo.load('Before', maturities[1]);

      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[1],
          Side.BORROW,
          filledOrderAmount.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[1],
          0,
          alice.address,
          10,
        ),
      ).to.emit(lendingMarketController, 'Liquidate');

      const lendingInfoAfter = await lendingInfo.load('After', maturities[1]);
      lendingInfo.show();

      const errorRange = BigNumber.from(1000);
      expect(lendingInfoAfter.coverage.lt(lendingInfoBefore.coverage)).to.true;
      expect(lendingInfoAfter.pv.sub(lendingInfoBefore.pv.div(2)).abs()).to.lt(
        errorRange,
      );
    });

    it('Liquidate partially due to insufficient collateral', async () => {
      const alice = singers[8];
      const bob = singers[9];

      const lendingInfo = new LendingInfo(alice.address);
      const filledOrderAmount = BigNumber.from('200000000000000000000');
      const depositAmount = BigNumber.from('1000000000000000000');

      const aliceBalanceBefore = await wFILToken.balanceOf(alice.address);

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
          maturities[0],
          Side.BORROW,
          filledOrderAmount,
          '8000',
        );

      await lendingMarketController
        .connect(owner)
        .createOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          filledOrderAmount.mul(2),
          '8000',
        );

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            filledOrderAmount,
            '0',
          ),
      ).to.emit(lendingMarketController, 'FillOrder');

      await lendingMarketController
        .connect(owner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.LEND,
          '10000000000000000000',
          '8001',
        );

      expect(
        await tokenVault.getDepositAmount(alice.address, hexFILString),
      ).to.equal(filledOrderAmount);

      await tokenVault
        .connect(alice)
        .withdraw(hexFILString, '200000000000000000000');

      const aliceBalanceAfter = await wFILToken.balanceOf(alice.address);
      expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.equal(
        filledOrderAmount,
      );

      await filToETHPriceFeed.updateAnswer(filToETHRate.mul('3'));

      const lendingInfoBefore = await lendingInfo.load('Before', maturities[0]);

      await expect(
        lendingMarketController.executeLiquidationCall(
          hexETHString,
          hexFILString,
          maturities[0],
          '87634484208095058544',
          alice.address,
          10,
        ),
      )
        .to.emit(lendingMarketController, 'Liquidate')
        .withArgs(
          alice.address,
          hexETHString,
          hexFILString,
          maturities[0],
          '87634484208095058544',
        );

      const lendingInfoAfter = await lendingInfo.load('After', maturities[0]);
      lendingInfo.show();

      expect(lendingInfoAfter.coverage.gt(lendingInfoBefore.coverage)).to.true;
      expect(lendingInfoAfter.pv.abs().gt(lendingInfoBefore.pv.div(2).abs())).to
        .true;
    });
  });
});
