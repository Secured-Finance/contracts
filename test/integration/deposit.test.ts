import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import {
  deployContracts,
  LIQUIDATION_THRESHOLD_RATE,
} from '../../utils/deployment';
import { filToETHRate } from '../../utils/numbers';
import { hexETHString, hexFILString } from '../../utils/strings';
import { TestWallet } from '../../utils/wallet';

describe('Integration Test: Deposit', async () => {
  let signers: SignerWithAddress[];
  let alice: Wallet;
  let bob: Wallet;
  let carol: Wallet;

  let addressResolver: Contract;
  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let mockSwapRouter: Contract;

  let filMaturities: BigNumber[];
  let ethMaturities: BigNumber[];

  let testWallet: TestWallet;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');

  const createUsers = async (count: number) =>
    testWallet.create(count, async (user) => {
      await wFILToken
        .connect(signers[0])
        .transfer(user.address, initialFILBalance);
    });

  before('Deploy Contracts', async () => {
    signers = await ethers.getSigners();
    testWallet = new TestWallet(initialETHBalance, ethers);

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

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexFILString);
      await lendingMarketController.createLendingMarket(hexETHString);
    }
  });

  describe('Deposit ETH, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await createUsers(1);
    });

    it('Deposit ETH', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETHString, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETHString)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
    });

    it('Withdraw all collateral', async () => {
      await tokenVault
        .connect(alice)
        .withdraw(hexETHString, initialETHBalance.div(5));

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETHString)).to.equal(false);
      expect(depositAmount).to.equal(0);
    });
  });

  describe('Deposit ETH twice, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await createUsers(1);
    });

    it('Deposit ETH', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETHString, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      await tokenVault
        .connect(alice)
        .deposit(hexETHString, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5).mul(2));
      expect(depositAmount).to.equal(initialETHBalance.div(5).mul(2));
    });

    it('Withdraw partially', async () => {
      await tokenVault
        .connect(alice)
        .withdraw(hexETHString, initialETHBalance.div(5));

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETHString)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
    });

    it('Withdraw with over amount input', async () => {
      await tokenVault.connect(alice).withdraw(hexETHString, initialETHBalance);

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETHString)).to.equal(false);
      expect(depositAmount).to.equal(0);
    });
  });

  describe('Deposit multiple currency, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await createUsers(1);
    });

    it('Deposit ETH', async () => {
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await tokenVault
        .connect(alice)
        .deposit(hexETHString, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(
        initialETHBalance.div(5),
      );
      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETHString)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
    });

    it('Deposit FIL', async () => {
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await wFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexFILString, initialFILBalance.div(5));

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await wFILToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexFILString,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(0);
      expect(tokenVaultBalance).to.equal(initialFILBalance.div(5));
      expect(currencies.includes(hexFILString)).to.equal(true);
      expect(depositAmount).to.equal(initialFILBalance.div(5));
    });

    it('Withdraw ETH with over amount input', async () => {
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await tokenVault.connect(alice).withdraw(hexETHString, initialETHBalance);

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );

      expect(collateralAmountBefore.sub(collateralAmountAfter)).to.equal(
        initialETHBalance.div(5),
      );
      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETHString)).to.equal(false);
      expect(depositAmount).to.equal(0);
    });
  });

  describe('Deposit by multiple users', async () => {
    before(async () => {
      [alice, bob] = await createUsers(2);
    });

    it('Deposit FIL', async () => {
      await wFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance.div(5));
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);

      await tokenVault
        .connect(alice)
        .deposit(hexFILString, initialFILBalance.div(5));
      await tokenVault.connect(bob).deposit(hexFILString, initialFILBalance);

      const aliceDepositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexFILString,
      );
      const bobDepositAmount = await tokenVault.getDepositAmount(
        bob.address,
        hexFILString,
      );

      expect(aliceDepositAmount).to.equal(initialFILBalance.div(5));
      expect(bobDepositAmount).to.equal(initialFILBalance);
    });

    it('Withdraw by one user', async () => {
      const tokenVaultBalanceBefore = await wFILToken.balanceOf(
        tokenVault.address,
      );

      await tokenVault.connect(alice).withdraw(hexFILString, initialFILBalance);

      const tokenVaultBalanceAfter = await wFILToken.balanceOf(
        tokenVault.address,
      );
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexFILString,
      );

      expect(tokenVaultBalanceBefore.sub(tokenVaultBalanceAfter)).to.equal(
        initialFILBalance.div(5),
      );
      expect(depositAmount).to.equal(0);
    });

    it('Withdraw from empty deposit', async () => {
      const tokenVaultBalanceBefore = await wFILToken.balanceOf(
        tokenVault.address,
      );

      await tokenVault.connect(alice).withdraw(hexFILString, initialFILBalance);

      const tokenVaultBalanceAfter = await wFILToken.balanceOf(
        tokenVault.address,
      );

      expect(tokenVaultBalanceBefore).to.equal(tokenVaultBalanceAfter);
    });
  });

  describe('Fill an borrowing order, Withdraw collateral', async () => {
    const orderAmount = initialETHBalance
      .mul(BigNumber.from(10).pow(18))
      .div(filToETHRate)
      .div(5);

    before(async () => {
      [alice, bob, carol] = await createUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexFILString);

      await wFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexFILString, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETHString, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          '1000',
          '7800',
        );

      await lendingMarketController
        .connect(carol)
        .createOrder(hexFILString, filMaturities[0], Side.LEND, '1000', '8200');
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETHString, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexFILString, orderAmount);

      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
        );

      await lendingMarketController
        .connect(bob)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.LEND,
          orderAmount,
          '8000',
        );

      const coverage = await tokenVault.getCoverage(alice.address);
      const aliceFV = await lendingMarketController.getFutureValue(
        hexFILString,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexFILString,
        filMaturities[0],
        bob.address,
      );

      expect(coverage.sub('4000').abs()).lte(1);
      expect(aliceFV.abs()).to.equal(bobFV.abs());
    });

    it('Withdraw by borrower', async () => {
      const coverageBefore = await tokenVault.getCoverage(alice.address);
      const balanceBefore = await wFILToken.balanceOf(alice.address);

      await tokenVault.connect(alice).withdraw(hexFILString, orderAmount);

      const coverageAfter = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await wFILToken.balanceOf(alice.address);

      expect(coverageBefore).to.equal(coverageAfter);
      expect(balanceAfter.sub(balanceBefore)).to.equal(orderAmount);
    });

    it('Withdraw by lender(empty deposit)', async () => {
      const coverageBefore = await tokenVault.getCoverage(bob.address);
      const balanceBefore = await wFILToken.balanceOf(bob.address);

      const receipt = await tokenVault
        .connect(bob)
        .withdraw(hexFILString, orderAmount)
        .then((tx) => tx.wait());

      const coverageAfter = await tokenVault.getCoverage(bob.address);
      const balanceAfter = await wFILToken.balanceOf(bob.address);

      expect(coverageBefore).to.equal(0);
      expect(coverageAfter).to.equal(0);
      expect(balanceBefore.sub(balanceAfter)).to.equal(0);
    });
  });

  describe('Fill an lending order, Withdraw collateral', async () => {
    const orderAmount = initialETHBalance
      .mul(BigNumber.from(10).pow(18))
      .div(filToETHRate)
      .div(5);

    before(async () => {
      [alice, bob, carol] = await createUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexFILString);

      await wFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexFILString, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETHString, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          '1000',
          '7800',
        );

      await lendingMarketController
        .connect(carol)
        .createOrder(hexFILString, filMaturities[0], Side.LEND, '1000', '8200');
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETHString, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexFILString, orderAmount);

      await lendingMarketController
        .connect(bob)
        .createOrder(
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
          '8000',
        );

      const coverage = await tokenVault.getCoverage(alice.address);
      const aliceFV = await lendingMarketController.getFutureValue(
        hexFILString,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexFILString,
        filMaturities[0],
        bob.address,
      );

      expect(coverage.sub('4000').abs()).lte(1);
      expect(aliceFV.abs()).to.equal(bobFV.abs());
    });

    it('Withdraw by borrower', async () => {
      const coverageBefore = await tokenVault.getCoverage(alice.address);
      const balanceBefore = await wFILToken.balanceOf(alice.address);

      await tokenVault.connect(alice).withdraw(hexFILString, orderAmount);

      const coverageAfter = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await wFILToken.balanceOf(alice.address);

      expect(coverageBefore).to.equal(coverageAfter);
      expect(balanceAfter.sub(balanceBefore)).to.equal(orderAmount);
    });

    it('Withdraw by lender(empty deposit)', async () => {
      const coverageBefore = await tokenVault.getCoverage(bob.address);
      const balanceBefore = await wFILToken.balanceOf(bob.address);

      const receipt = await tokenVault
        .connect(bob)
        .withdraw(hexFILString, orderAmount)
        .then((tx) => tx.wait());

      const coverageAfter = await tokenVault.getCoverage(bob.address);
      const balanceAfter = await wFILToken.balanceOf(bob.address);

      expect(coverageBefore).to.equal(0);
      expect(coverageAfter).to.equal(0);
      expect(balanceBefore.sub(balanceAfter)).to.equal(0);
    });
  });

  describe('Fill orders on multiple markets, Withdraw collateral', async () => {
    const orderAmountInETH = initialETHBalance.div(4);

    const orderAmountInFIL = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(filToETHRate);

    before(async () => {
      [alice, bob, carol] = await createUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexFILString);
      ethMaturities = await lendingMarketController.getMaturities(hexETHString);

      await wFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexFILString, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETHString, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          '1000',
          '7800',
        );

      await lendingMarketController
        .connect(carol)
        .createOrder(hexFILString, filMaturities[0], Side.LEND, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .createOrder(
          hexETHString,
          ethMaturities[0],
          Side.BORROW,
          '1000',
          '7800',
        );

      await lendingMarketController
        .connect(carol)
        .depositAndCreateLendOrderWithETH(
          hexETHString,
          ethMaturities[0],
          '8200',
          { value: '1000' },
        );
    });

    it('Fill an order on the FIL market', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETHString, orderAmountInETH.mul(2), {
          value: orderAmountInETH.mul(2),
        });
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexFILString, orderAmountInFIL);

      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.BORROW,
          orderAmountInFIL,
          '8000',
        );

      await lendingMarketController
        .connect(bob)
        .createOrder(
          hexFILString,
          filMaturities[0],
          Side.LEND,
          orderAmountInFIL,
          '8000',
        );

      const coverage = await tokenVault.getCoverage(alice.address);
      const aliceFV = await lendingMarketController.getFutureValue(
        hexFILString,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexFILString,
        filMaturities[0],
        bob.address,
      );

      expect(coverage.sub('5000').abs()).lte(1);
      expect(aliceFV.abs()).to.equal(bobFV.abs());
    });

    it('Fill an order on the ETH market', async () => {
      const orderAmount = orderAmountInETH.div(4);
      const totalCollateralAmountBefore =
        await tokenVault.getTotalCollateralAmount(alice.address);

      await lendingMarketController
        .connect(bob)
        .createOrder(
          hexETHString,
          ethMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
        );

      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexETHString,
          ethMaturities[0],
          Side.LEND,
          orderAmount,
          '8000',
        );

      const totalCollateralAmountAfter =
        await tokenVault.getTotalCollateralAmount(alice.address);
      const ethHaircut = await currencyController.getHaircut(hexETHString);

      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(orderAmount.sub(orderAmount.mul(ethHaircut).div('10000')));
    });

    it('Withdraw by Alice', async () => {
      const balanceBefore = await alice.getBalance();

      await tokenVault.connect(alice).withdraw(hexETHString, orderAmountInETH);

      const coverage = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await alice.getBalance();

      expect(coverage.sub('8000').abs()).lte(1);
      expect(balanceAfter.sub(balanceBefore)).to.lte(orderAmountInETH);
    });
  });
});
