import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
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
} from '../common/constants';
import { deployContracts } from '../common/deployment';
import { Signers } from '../common/signers';

describe('Integration Test: Deposit', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let addressResolver: Contract;
  let currencyController: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;
  let wFILToken: Contract;
  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;

  let filMaturities: BigNumber[];
  let ethMaturities: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialUSDCBalance = BigNumber.from('10000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
      await usdcToken
        .connect(owner)
        .transfer(signer.address, initialUSDCBalance);
    });

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      addressResolver,
      currencyController,
      tokenVault,
      lendingMarketController,
      wETHToken,
      usdcToken,
      wFILToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address, false);
    await tokenVault.registerCurrency(hexUSDCString, usdcToken.address, false);
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
    await mockUniswapRouter.setToken(hexUSDCString, usdcToken.address);
    await mockUniswapRouter.setToken(hexFILString, wFILToken.address);
    await mockUniswapQuoter.setToken(hexETHString, wETHToken.address);
    await mockUniswapQuoter.setToken(hexUSDCString, usdcToken.address);
    await mockUniswapQuoter.setToken(hexFILString, wFILToken.address);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
      mockUniswapRouter.address,
      mockUniswapQuoter.address,
    );

    await tokenVault.updateCurrency(hexETHString, true);
    await tokenVault.updateCurrency(hexUSDCString, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexFILString);
      await lendingMarketController.createLendingMarket(hexETHString);
    }
  });

  describe('Deposit ETH, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await getUsers(1);
    });

    it('Deposit ETH', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETHString);

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
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETHString)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Withdraw all collateral', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETHString);

      await tokenVault
        .connect(alice)
        .withdraw(hexETHString, initialETHBalance.div(5));

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETHString)).to.equal(false);
      expect(depositAmount).to.equal(0);
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialETHBalance.div(5));
    });
  });

  describe('Deposit ETH twice, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await getUsers(1);
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
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETHString);
      await tokenVault
        .connect(alice)
        .withdraw(hexETHString, initialETHBalance.div(5));

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETHString)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Withdraw with over amount input', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETHString);
      await tokenVault.connect(alice).withdraw(hexETHString, initialETHBalance);

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETHString,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETHString,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETHString)).to.equal(false);
      expect(depositAmount).to.equal(0);
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialETHBalance.div(5));
    });
  });

  describe('Deposit multiple currency, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await getUsers(1);
    });

    it('Deposit ETH (Non-ERC20 collateral currency)', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETHString);
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
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETHString,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(
        initialETHBalance.div(5),
      );
      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETHString)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Deposit FIL (ERC20 non-collateral currency)', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexFILString);
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
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexFILString,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(0);
      expect(tokenVaultBalance).to.equal(initialFILBalance.div(5));
      expect(currencies.includes(hexFILString)).to.equal(true);
      expect(depositAmount).to.equal(initialFILBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialFILBalance.div(5));
    });

    it('Withdraw ETH with over amount input', async () => {
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETHString);

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
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETHString,
      );

      expect(collateralAmountBefore.sub(collateralAmountAfter)).to.equal(
        initialETHBalance.div(5),
      );
      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETHString)).to.equal(false);
      expect(depositAmount).to.equal(0);
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Deposit USDC (ERC20 collateral currency)', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexUSDCString);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await usdcToken
        .connect(alice)
        .approve(tokenVault.address, initialUSDCBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexUSDCString, initialUSDCBalance.div(5));

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await usdcToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexUSDCString,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexUSDCString,
      );

      const estimatedDepositAmountInETH = await currencyController[
        'convertToETH(bytes32,uint256)'
      ](hexUSDCString, initialUSDCBalance.div(5));

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(
        estimatedDepositAmountInETH,
      );
      expect(tokenVaultBalance).to.equal(initialUSDCBalance.div(5));
      expect(currencies.includes(hexUSDCString)).to.equal(true);
      expect(depositAmount).to.equal(initialUSDCBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialUSDCBalance.div(5));
    });
  });

  describe('Deposit by multiple users', async () => {
    before(async () => {
      [alice, bob] = await getUsers(2);
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
    const orderAmountInETH = initialETHBalance.div(5);
    const orderAmount = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(filToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
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
      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
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

      await tokenVault
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
    const orderAmountInETH = initialETHBalance.div(5);
    const orderAmount = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(filToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
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

      expect(coverage.sub('4010').abs()).lte(1);
      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
      // expect(aliceFV.abs()).to.equal(bobFV.abs());
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

      await tokenVault
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
      [alice, bob, carol] = await getUsers(3);
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
        .depositAndCreateOrder(
          hexETHString,
          ethMaturities[0],
          Side.LEND,
          '1000',
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
      await tokenVault
        .connect(bob)
        .deposit(hexFILString, orderAmountInFIL.mul(3).div(2));

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
      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
    });

    it('Fill an order on the ETH market', async () => {
      const orderAmount = orderAmountInETH.div(4);
      const totalCollateralAmountBefore =
        await tokenVault.getTotalCollateralAmount(alice.address);

      await wFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance);

      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);

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

      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
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
