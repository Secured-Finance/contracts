import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexEFIL, hexETH, hexUSDC } from '../../utils/strings';
import {
  eFilToETHRate,
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
  let eFILToken: Contract;
  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;

  let genesisDate: number;
  let filMaturities: BigNumber[];
  let ethMaturities: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('1000000000000000000');
  const initialUSDCBalance = BigNumber.from('10000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await eFILToken
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
      genesisDate,
      addressResolver,
      currencyController,
      tokenVault,
      lendingMarketController,
      wETHToken,
      usdcToken,
      eFILToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexUSDC, usdcToken.address, false);
    await tokenVault.registerCurrency(hexEFIL, eFILToken.address, false);

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
    await mockUniswapRouter.setToken(hexUSDC, usdcToken.address);
    await mockUniswapRouter.setToken(hexEFIL, eFILToken.address);
    await mockUniswapQuoter.setToken(hexETH, wETHToken.address);
    await mockUniswapQuoter.setToken(hexUSDC, usdcToken.address);
    await mockUniswapQuoter.setToken(hexEFIL, eFILToken.address);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
      mockUniswapRouter.address,
      mockUniswapQuoter.address,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createLendingMarket(hexEFIL, genesisDate);
      await lendingMarketController.createLendingMarket(hexETH, genesisDate);
    }
  });

  describe('Deposit ETH, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await getUsers(1);
    });

    it('Deposit ETH', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETH);

      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETH,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETH)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Withdraw all collateral', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETH);

      await tokenVault
        .connect(alice)
        .withdraw(hexETH, initialETHBalance.div(5));

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETH,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETH)).to.equal(false);
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
        .deposit(hexETH, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5).mul(2));
      expect(depositAmount).to.equal(initialETHBalance.div(5).mul(2));
    });

    it('Withdraw partially', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETH);
      await tokenVault
        .connect(alice)
        .withdraw(hexETH, initialETHBalance.div(5));

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETH,
      );

      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETH)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Withdraw with over amount input', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETH);
      await tokenVault.connect(alice).withdraw(hexETH, initialETHBalance);

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETH,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETH)).to.equal(false);
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
        await tokenVault.getTotalDepositAmount(hexETH);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(5), {
          value: initialETHBalance.div(5),
        });

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETH,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(
        initialETHBalance.div(5),
      );
      expect(tokenVaultBalance).to.equal(initialETHBalance.div(5));
      expect(currencies.includes(hexETH)).to.equal(true);
      expect(depositAmount).to.equal(initialETHBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Deposit FIL (ERC20 non-collateral currency)', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexEFIL);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await eFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexEFIL, initialFILBalance.div(5));

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await eFILToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexEFIL,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexEFIL,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(0);
      expect(tokenVaultBalance).to.equal(initialFILBalance.div(5));
      expect(currencies.includes(hexEFIL)).to.equal(true);
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
        await tokenVault.getTotalDepositAmount(hexETH);

      await tokenVault.connect(alice).withdraw(hexETH, initialETHBalance);

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      const tokenVaultBalance = await wETHToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexETH,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexETH,
      );

      expect(collateralAmountBefore.sub(collateralAmountAfter)).to.equal(
        initialETHBalance.div(5),
      );
      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexETH)).to.equal(false);
      expect(depositAmount).to.equal(0);
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialETHBalance.div(5));
    });

    it('Deposit USDC (ERC20 collateral currency)', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexUSDC);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await usdcToken
        .connect(alice)
        .approve(tokenVault.address, initialUSDCBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexUSDC, initialUSDCBalance.div(5));

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await usdcToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexUSDC,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexUSDC,
      );

      const estimatedDepositAmountInETH = await currencyController[
        'convertToETH(bytes32,uint256)'
      ](hexUSDC, initialUSDCBalance.div(5));

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(
        estimatedDepositAmountInETH,
      );
      expect(tokenVaultBalance).to.equal(initialUSDCBalance.div(5));
      expect(currencies.includes(hexUSDC)).to.equal(true);
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
      await eFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance.div(5));
      await eFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);

      await tokenVault
        .connect(alice)
        .deposit(hexEFIL, initialFILBalance.div(5));
      await tokenVault.connect(bob).deposit(hexEFIL, initialFILBalance);

      const aliceDepositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexEFIL,
      );
      const bobDepositAmount = await tokenVault.getDepositAmount(
        bob.address,
        hexEFIL,
      );

      expect(aliceDepositAmount).to.equal(initialFILBalance.div(5));
      expect(bobDepositAmount).to.equal(initialFILBalance);
    });

    it('Withdraw by one user', async () => {
      const tokenVaultBalanceBefore = await eFILToken.balanceOf(
        tokenVault.address,
      );

      await tokenVault.connect(alice).withdraw(hexEFIL, initialFILBalance);

      const tokenVaultBalanceAfter = await eFILToken.balanceOf(
        tokenVault.address,
      );
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexEFIL,
      );

      expect(tokenVaultBalanceBefore.sub(tokenVaultBalanceAfter)).to.equal(
        initialFILBalance.div(5),
      );
      expect(depositAmount).to.equal(0);
    });

    it('Withdraw from empty deposit', async () => {
      const tokenVaultBalanceBefore = await eFILToken.balanceOf(
        tokenVault.address,
      );

      await tokenVault.connect(alice).withdraw(hexEFIL, initialFILBalance);

      const tokenVaultBalanceAfter = await eFILToken.balanceOf(
        tokenVault.address,
      );

      expect(tokenVaultBalanceBefore).to.equal(tokenVaultBalanceAfter);
    });
  });

  describe('Fill an borrowing order, Withdraw collateral', async () => {
    const orderAmountInETH = initialETHBalance.div(5);
    const orderAmount = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(eFilToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexEFIL);

      await eFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexEFIL, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .createOrder(hexEFIL, filMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .createOrder(hexEFIL, filMaturities[0], Side.LEND, '1000', '7800');
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await eFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexEFIL, orderAmount);

      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexEFIL,
          filMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
        );

      await lendingMarketController
        .connect(bob)
        .createOrder(hexEFIL, filMaturities[0], Side.LEND, orderAmount, '0');

      const coverage = await tokenVault.getCoverage(alice.address);
      const aliceFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        bob.address,
      );

      expect(coverage.sub('4000').abs()).lte(1);
      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
    });

    it('Withdraw by borrower', async () => {
      const coverageBefore = await tokenVault.getCoverage(alice.address);
      const balanceBefore = await eFILToken.balanceOf(alice.address);

      await tokenVault.connect(alice).withdraw(hexEFIL, orderAmount);

      const coverageAfter = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await eFILToken.balanceOf(alice.address);

      expect(coverageBefore).to.equal(coverageAfter);
      expect(balanceAfter.sub(balanceBefore)).to.equal(orderAmount);
    });

    it('Withdraw by lender(empty deposit)', async () => {
      const coverageBefore = await tokenVault.getCoverage(bob.address);
      const balanceBefore = await eFILToken.balanceOf(bob.address);

      await tokenVault
        .connect(bob)
        .withdraw(hexEFIL, orderAmount)
        .then((tx) => tx.wait());

      const coverageAfter = await tokenVault.getCoverage(bob.address);
      const balanceAfter = await eFILToken.balanceOf(bob.address);

      expect(coverageBefore).to.equal(0);
      expect(coverageAfter).to.equal(0);
      expect(balanceBefore.sub(balanceAfter)).to.equal(0);
    });
  });

  describe('Fill an lending order, Withdraw collateral', async () => {
    const orderAmountInETH = initialETHBalance.div(5);
    const orderAmount = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(eFilToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexEFIL);

      await eFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexEFIL, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .createOrder(hexEFIL, filMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .createOrder(hexEFIL, filMaturities[0], Side.LEND, '1000', '7800');
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await eFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexEFIL, orderAmount);

      await lendingMarketController
        .connect(bob)
        .createOrder(hexEFIL, filMaturities[0], Side.LEND, orderAmount, '8000');

      await lendingMarketController
        .connect(alice)
        .createOrder(hexEFIL, filMaturities[0], Side.BORROW, orderAmount, '0');

      const coverage = await tokenVault.getCoverage(alice.address);
      const aliceFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        bob.address,
      );

      expect(coverage.sub('4010').abs()).lte(1);
      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
    });

    it('Withdraw by borrower', async () => {
      const coverageBefore = await tokenVault.getCoverage(alice.address);
      const balanceBefore = await eFILToken.balanceOf(alice.address);

      await tokenVault.connect(alice).withdraw(hexEFIL, orderAmount);

      const coverageAfter = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await eFILToken.balanceOf(alice.address);

      expect(coverageBefore).to.equal(coverageAfter);
      expect(balanceAfter.sub(balanceBefore)).to.equal(orderAmount);
    });

    it('Withdraw by lender(empty deposit)', async () => {
      const coverageBefore = await tokenVault.getCoverage(bob.address);
      const balanceBefore = await eFILToken.balanceOf(bob.address);

      await tokenVault
        .connect(bob)
        .withdraw(hexEFIL, orderAmount)
        .then((tx) => tx.wait());

      const coverageAfter = await tokenVault.getCoverage(bob.address);
      const balanceAfter = await eFILToken.balanceOf(bob.address);

      expect(coverageBefore).to.equal(0);
      expect(coverageAfter).to.equal(0);
      expect(balanceBefore.sub(balanceAfter)).to.equal(0);
    });
  });

  describe('Fill orders on multiple markets, Withdraw collateral', async () => {
    const orderAmountInETH = initialETHBalance.div(4);

    const orderAmountInFIL = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(eFilToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexEFIL);
      ethMaturities = await lendingMarketController.getMaturities(hexETH);

      await eFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexEFIL, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .createOrder(hexEFIL, filMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .createOrder(hexEFIL, filMaturities[0], Side.LEND, '1000', '7800');

      await lendingMarketController
        .connect(carol)
        .createOrder(hexETH, ethMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .depositAndCreateOrder(
          hexETH,
          ethMaturities[0],
          Side.LEND,
          '1000',
          '7800',
          { value: '1000' },
        );
    });

    it('Fill an order on the FIL market', async () => {
      await tokenVault.connect(alice).deposit(hexETH, orderAmountInETH.mul(2), {
        value: orderAmountInETH.mul(2),
      });
      await eFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault
        .connect(bob)
        .deposit(hexEFIL, orderAmountInFIL.mul(3).div(2));

      await lendingMarketController
        .connect(alice)
        .createOrder(
          hexEFIL,
          filMaturities[0],
          Side.BORROW,
          orderAmountInFIL,
          '8000',
        );

      await lendingMarketController
        .connect(bob)
        .createOrder(
          hexEFIL,
          filMaturities[0],
          Side.LEND,
          orderAmountInFIL,
          '0',
        );

      const coverage = await tokenVault.getCoverage(alice.address);
      const aliceFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexEFIL,
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

      await eFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance);

      await eFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);

      await lendingMarketController
        .connect(bob)
        .createOrder(
          hexETH,
          ethMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
        );

      await lendingMarketController
        .connect(alice)
        .createOrder(hexETH, ethMaturities[0], Side.LEND, orderAmount, '0');

      const aliceFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        alice.address,
      );
      const bobFV = await lendingMarketController.getFutureValue(
        hexEFIL,
        filMaturities[0],
        bob.address,
      );

      expect(bobFV.mul(10000).div(aliceFV).abs().sub(9975).abs()).to.lte(1);
    });

    it('Withdraw by Alice', async () => {
      const balanceBefore = await alice.getBalance();

      await tokenVault.connect(alice).withdraw(hexETH, orderAmountInETH);

      const coverage = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await alice.getBalance();

      expect(coverage.sub('8000').abs()).lte(1);
      expect(balanceAfter.sub(balanceBefore)).to.lte(orderAmountInETH);
    });
  });
});
