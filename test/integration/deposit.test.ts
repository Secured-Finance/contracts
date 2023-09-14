import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWBTC, hexWFIL } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
  PRICE_DIGIT,
} from '../common/constants';
import { wFilToETHRate, wbtcToETHRate } from '../common/currencies';
import { deployContracts } from '../common/deployment';
import { calculateOrderFee } from '../common/orders';
import { Signers } from '../common/signers';

describe('Integration Test: Deposit', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let currencyController: Contract;
  let tokenVault: Contract;
  let reserveFund: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;
  let wFILToken: Contract;
  let wBTCToken: Contract;

  let fundManagementLogic: Contract;

  let addressResolver: Contract;
  let mockUniswapRouter: Contract;
  let mockUniswapQuoter: Contract;
  let liquidator: Contract;

  let genesisDate: number;
  let filMaturities: BigNumber[];
  let ethMaturities: BigNumber[];
  let wBTCMaturities: BigNumber[];

  let signers: Signers;

  const initialETHBalance = BigNumber.from('10000000000000000');
  const initialUSDCBalance = BigNumber.from('100000000000');
  const initialFILBalance = BigNumber.from('100000000000000000000');
  const initialWBTCBalance = BigNumber.from('10000000000');

  const getUsers = async (count: number) =>
    signers.get(count, async (signer) => {
      await wFILToken
        .connect(owner)
        .transfer(signer.address, initialFILBalance);
      await usdcToken
        .connect(owner)
        .transfer(signer.address, initialUSDCBalance);
      await wBTCToken
        .connect(owner)
        .transfer(signer.address, initialWBTCBalance);
    });

  before('Deploy Contracts', async () => {
    signers = new Signers(await ethers.getSigners());
    [owner] = await signers.get(1);

    ({
      genesisDate,
      addressResolver,
      currencyController,
      tokenVault,
      reserveFund,
      lendingMarketController,
      wETHToken,
      usdcToken,
      wFILToken,
      wBTCToken,
      fundManagementLogic,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexUSDC, usdcToken.address, false);
    await tokenVault.registerCurrency(hexWFIL, wFILToken.address, false);
    await tokenVault.registerCurrency(hexWBTC, wBTCToken.address, false);

    await tokenVault.updateLiquidationConfiguration(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);
    await tokenVault.updateCurrency(hexWBTC, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController.createOrderBook(
        hexWFIL,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexETH,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexWBTC,
        genesisDate,
        genesisDate,
      );
      await lendingMarketController.createOrderBook(
        hexUSDC,
        genesisDate,
        genesisDate,
      );
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

  describe('Deposit WBTC, Withdraw all collateral', async () => {
    before(async () => {
      [alice] = await getUsers(1);
    });

    it('Deposit WBTC', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexWBTC);

      await wBTCToken
        .connect(alice)
        .approve(tokenVault.address, initialWBTCBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexWBTC, initialWBTCBalance.div(5));

      const tokenVaultBalance = await wBTCToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWBTC,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexWBTC,
      );

      expect(tokenVaultBalance).to.equal(initialWBTCBalance.div(5));
      expect(currencies.includes(hexWBTC)).to.equal(true);
      expect(depositAmount).to.equal(initialWBTCBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialWBTCBalance.div(5));
    });

    it('Withdraw all collateral', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexWBTC);

      await tokenVault
        .connect(alice)
        .withdraw(hexWBTC, initialETHBalance.div(5));

      const tokenVaultBalance = await wBTCToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWBTC,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexWBTC,
      );

      expect(tokenVaultBalance).to.equal(0);
      expect(currencies.includes(hexWBTC)).to.equal(false);
      expect(depositAmount).to.equal(0);
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(initialWBTCBalance.div(5));
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
        .getDepositAmount(alice.address, hexETH);
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
        await tokenVault.getTotalDepositAmount(hexWFIL);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      await wFILToken
        .connect(alice)
        .approve(tokenVault.address, initialFILBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexWFIL, initialFILBalance.div(5));

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await wFILToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWFIL,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexWFIL,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(0);
      expect(tokenVaultBalance).to.equal(initialFILBalance.div(5));
      expect(currencies.includes(hexWFIL)).to.equal(true);
      expect(depositAmount).to.equal(initialFILBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialFILBalance.div(5));
    });

    it('Withdraw ETH with over amount input', async () => {
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getDepositAmount(alice.address, hexETH);
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexETH);

      await tokenVault.connect(alice).withdraw(hexETH, initialETHBalance);

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getDepositAmount(alice.address, hexETH);

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
        'convertToBaseCurrency(bytes32,uint256)'
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

    it('Deposit WBTC (ERC20 collateral currency)', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexWBTC);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      await wBTCToken
        .connect(alice)
        .approve(tokenVault.address, initialWBTCBalance.div(5));
      await tokenVault
        .connect(alice)
        .deposit(hexWBTC, initialWBTCBalance.div(5));

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalance = await wBTCToken.balanceOf(tokenVault.address);
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWBTC,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexWBTC,
      );

      const estimatedDepositAmountInETH = await currencyController[
        'convertToBaseCurrency(bytes32,uint256)'
      ](hexWBTC, initialWBTCBalance.div(5));
      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(
        estimatedDepositAmountInETH,
      );
      expect(tokenVaultBalance).to.equal(initialWBTCBalance.div(5));
      expect(currencies.includes(hexWBTC)).to.equal(true);
      expect(depositAmount).to.equal(initialWBTCBalance.div(5));
      expect(
        totalCollateralAmountAfter.sub(totalCollateralAmountBefore),
      ).to.equal(initialWBTCBalance.div(5));
    });

    it('Withdraw FIL (ERC20 non-collateral currency) with over amount input', async () => {
      const totalCollateralAmountBefore =
        await tokenVault.getTotalDepositAmount(hexWFIL);
      const collateralAmountBefore = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);
      const tokenVaultBalanceBefore = await wFILToken.balanceOf(
        tokenVault.address,
      );

      await tokenVault.connect(alice).withdraw(hexWFIL, initialFILBalance);

      const collateralAmountAfter = await tokenVault
        .connect(alice)
        .getTotalCollateralAmount(alice.address);

      const tokenVaultBalanceAfter = await wFILToken.balanceOf(
        tokenVault.address,
      );
      const currencies = await tokenVault.getUsedCurrencies(alice.address);
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWFIL,
      );
      const totalCollateralAmountAfter = await tokenVault.getTotalDepositAmount(
        hexWFIL,
      );

      expect(collateralAmountAfter.sub(collateralAmountBefore)).to.equal(0);
      expect(tokenVaultBalanceAfter).to.equal(0);
      expect(currencies.includes(hexWFIL)).to.equal(false);
      expect(depositAmount).to.equal(0);
      expect(
        totalCollateralAmountBefore.sub(totalCollateralAmountAfter),
      ).to.equal(tokenVaultBalanceBefore);
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
        .deposit(hexWFIL, initialFILBalance.div(5));
      await tokenVault.connect(bob).deposit(hexWFIL, initialFILBalance);

      const aliceDepositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWFIL,
      );
      const bobDepositAmount = await tokenVault.getDepositAmount(
        bob.address,
        hexWFIL,
      );

      expect(aliceDepositAmount).to.equal(initialFILBalance.div(5));
      expect(bobDepositAmount).to.equal(initialFILBalance);
    });

    it('Withdraw by one user', async () => {
      const tokenVaultBalanceBefore = await wFILToken.balanceOf(
        tokenVault.address,
      );

      await tokenVault.connect(alice).withdraw(hexWFIL, initialFILBalance);

      const tokenVaultBalanceAfter = await wFILToken.balanceOf(
        tokenVault.address,
      );
      const depositAmount = await tokenVault.getDepositAmount(
        alice.address,
        hexWFIL,
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

      await tokenVault.connect(alice).withdraw(hexWFIL, initialFILBalance);

      const tokenVaultBalanceAfter = await wFILToken.balanceOf(
        tokenVault.address,
      );

      expect(tokenVaultBalanceBefore).to.equal(tokenVaultBalanceAfter);
    });
  });

  describe('Fill an borrowing order, Withdraw collateral', async () => {
    const orderAmountInETH = initialETHBalance.div(5);
    const orderAmountInFIL = orderAmountInETH
      .mul(BigNumber.from(10).pow(18))
      .div(wFilToETHRate);
    const orderAmountInWBTC = orderAmountInETH
      .mul(BigNumber.from(10).pow(8))
      .div(wbtcToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      wBTCMaturities = await lendingMarketController.getMaturities(hexWBTC);

      await wFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexWFIL, initialFILBalance);
      await wBTCToken
        .connect(carol)
        .approve(tokenVault.address, initialWBTCBalance);
      await tokenVault.connect(carol).deposit(hexWBTC, orderAmountInWBTC);
      await tokenVault.connect(carol).deposit(hexETH, initialETHBalance, {
        value: initialETHBalance,
      });

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWFIL, filMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWFIL, filMaturities[0], Side.LEND, '1000', '7800');

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWBTC, wBTCMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWBTC, wBTCMaturities[0], Side.LEND, '1000', '7800');
    });

    it('Fill an order(WBTC)', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await wBTCToken
        .connect(bob)
        .approve(tokenVault.address, initialWBTCBalance);
      await tokenVault.connect(bob).deposit(hexWBTC, orderAmountInWBTC);

      await lendingMarketController
        .connect(alice)
        .executeOrder(
          hexWBTC,
          wBTCMaturities[0],
          Side.BORROW,
          orderAmountInWBTC,
          '8000',
        );
      const tx = await lendingMarketController
        .connect(bob)
        .executeOrder(
          hexWBTC,
          wBTCMaturities[0],
          Side.LEND,
          orderAmountInWBTC,
          '0',
        );

      const coverage = await tokenVault.getCoverage(alice.address);

      const { futureValue: aliceFV } =
        await lendingMarketController.getPosition(
          hexWBTC,
          wBTCMaturities[0],
          alice.address,
        );
      const { futureValue: bobFV } = await lendingMarketController.getPosition(
        hexWBTC,
        wBTCMaturities[0],
        bob.address,
      );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
      const fee = calculateOrderFee(
        orderAmountInWBTC,
        8000,
        wBTCMaturities[0].sub(timestamp),
      );

      expect(coverage.sub('2857').abs()).lte(1);
      expect(bobFV.add(aliceFV).add(fee).abs()).to.lte(1);
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexWFIL, orderAmountInFIL);

      await lendingMarketController
        .connect(alice)
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.BORROW,
          orderAmountInFIL,
          '8000',
        );
      const tx = await lendingMarketController
        .connect(bob)
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.LEND,
          orderAmountInFIL,
          '0',
        );

      const coverage = await tokenVault.getCoverage(alice.address);
      const { futureValue: aliceFV } =
        await lendingMarketController.getPosition(
          hexWFIL,
          filMaturities[0],
          alice.address,
        );
      const { futureValue: bobFV } = await lendingMarketController.getPosition(
        hexWFIL,
        filMaturities[0],
        bob.address,
      );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
      const fee = calculateOrderFee(
        orderAmountInFIL,
        8000,
        filMaturities[0].sub(timestamp),
      );

      expect(coverage.sub('3333').abs()).lte(1);
      expect(bobFV.add(aliceFV).add(fee).abs()).to.lte(1);
    });

    it('Withdraw by borrower', async () => {
      const coverageBefore = await tokenVault.getCoverage(alice.address);
      const balanceBefore = await wFILToken.balanceOf(alice.address);

      await tokenVault.connect(alice).withdraw(hexWFIL, orderAmountInFIL);

      const coverageAfter = await tokenVault.getCoverage(alice.address);
      const balanceAfter = await wFILToken.balanceOf(alice.address);

      expect(coverageBefore).to.equal(coverageAfter);
      expect(balanceAfter.sub(balanceBefore)).to.equal(orderAmountInFIL);
    });

    it('Withdraw by lender(empty deposit)', async () => {
      const coverageBefore = await tokenVault.getCoverage(bob.address);
      const balanceBefore = await wFILToken.balanceOf(bob.address);

      await tokenVault
        .connect(bob)
        .withdraw(hexWFIL, orderAmountInFIL)
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
      .div(wFilToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexWFIL);

      await wFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexWFIL, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWFIL, filMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWFIL, filMaturities[0], Side.LEND, '1000', '7800');
    });

    it('Fill an order', async () => {
      await tokenVault
        .connect(alice)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(bob).deposit(hexWFIL, orderAmount);

      await lendingMarketController
        .connect(bob)
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.LEND,
          orderAmount,
          '8000',
        );

      const tx = await lendingMarketController
        .connect(alice)
        .executeOrder(hexWFIL, filMaturities[0], Side.BORROW, orderAmount, '0');

      const coverage = await tokenVault.getCoverage(alice.address);
      const { futureValue: aliceFV, presentValue: alicePV } =
        await lendingMarketController.getPosition(
          hexWFIL,
          filMaturities[0],
          alice.address,
        );
      const { futureValue: bobFV } = await lendingMarketController.getPosition(
        hexWFIL,
        filMaturities[0],
        bob.address,
      );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
      const fee = calculateOrderFee(
        orderAmount,
        8000,
        filMaturities[0].sub(timestamp),
      );

      expect(
        coverage
          .sub(alicePV.abs().mul(PRICE_DIGIT).div(orderAmount.mul(5).div(2)))
          .abs(),
      ).lte(1);
      expect(bobFV.add(aliceFV).add(fee).abs()).to.lte(1);
    });

    it('Withdraw by borrower', async () => {
      const coverageBefore = await tokenVault.getCoverage(alice.address);
      const balanceBefore = await wFILToken.balanceOf(alice.address);

      await tokenVault.connect(alice).withdraw(hexWFIL, orderAmount);

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
        .withdraw(hexWFIL, orderAmount)
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
      .div(wFilToETHRate);

    before(async () => {
      [alice, bob, carol] = await getUsers(3);
      filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      ethMaturities = await lendingMarketController.getMaturities(hexETH);

      await wFILToken
        .connect(carol)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault.connect(carol).deposit(hexWFIL, initialFILBalance);
      await tokenVault
        .connect(carol)
        .deposit(hexETH, initialETHBalance.div(2), {
          value: initialETHBalance.div(2),
        });

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWFIL, filMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexWFIL, filMaturities[0], Side.LEND, '1000', '7800');

      await lendingMarketController
        .connect(carol)
        .executeOrder(hexETH, ethMaturities[0], Side.BORROW, '1000', '8200');

      await lendingMarketController
        .connect(carol)
        .depositAndExecuteOrder(
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
      await wFILToken
        .connect(bob)
        .approve(tokenVault.address, initialFILBalance);
      await tokenVault
        .connect(bob)
        .deposit(hexWFIL, orderAmountInFIL.mul(3).div(2));

      await lendingMarketController
        .connect(alice)
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.BORROW,
          orderAmountInFIL,
          '8000',
        );

      const tx = await lendingMarketController
        .connect(bob)
        .executeOrder(
          hexWFIL,
          filMaturities[0],
          Side.LEND,
          orderAmountInFIL,
          '0',
        );

      const coverage = await tokenVault.getCoverage(alice.address);
      const { futureValue: aliceFV } =
        await lendingMarketController.getPosition(
          hexWFIL,
          filMaturities[0],
          alice.address,
        );
      const { futureValue: bobFV } = await lendingMarketController.getPosition(
        hexWFIL,
        filMaturities[0],
        bob.address,
      );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
      const fee = calculateOrderFee(
        orderAmountInFIL,
        8000,
        filMaturities[0].sub(timestamp),
      );

      expect(coverage.sub('5000').abs()).lte(1);
      expect(bobFV.add(aliceFV).add(fee).abs()).to.lte(1);
    });

    it('Fill an order on the ETH market', async () => {
      const orderAmount = orderAmountInETH.div(4);
      await tokenVault.connect(bob).deposit(hexETH, orderAmountInETH, {
        value: orderAmountInETH,
      });
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
        .executeOrder(
          hexETH,
          ethMaturities[0],
          Side.BORROW,
          orderAmount,
          '8000',
        );

      const tx = await lendingMarketController
        .connect(alice)
        .executeOrder(hexETH, ethMaturities[0], Side.LEND, orderAmount, '0');

      const { futureValue: aliceFV } =
        await lendingMarketController.getPosition(
          hexETH,
          ethMaturities[0],
          alice.address,
        );
      const { futureValue: bobFV } = await lendingMarketController.getPosition(
        hexETH,
        ethMaturities[0],
        bob.address,
      );

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash);
      const fee = calculateOrderFee(
        orderAmount,
        8000,
        ethMaturities[0].sub(timestamp),
      );

      expect(bobFV.add(aliceFV).add(fee).abs()).to.lte(1);
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

  describe('Withdraw non-collateral currencies while a active lending order exists', async () => {
    before(async () => {
      [bob] = await getUsers(1);
      filMaturities = await lendingMarketController.getMaturities(hexWFIL);
      wBTCMaturities = await lendingMarketController.getMaturities(hexWBTC);
    });

    it('Place lending orders for non-collateral currencies, WFIL and WBTC', async () => {
      const filOrderAmount = initialFILBalance.div(2);
      const wbtcOrderAmount = initialWBTCBalance.div(10);
      await wFILToken.connect(bob).approve(tokenVault.address, filOrderAmount);

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWFIL,
            filMaturities[0],
            Side.LEND,
            filOrderAmount,
            '8000',
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');

      await wBTCToken.connect(bob).approve(tokenVault.address, wbtcOrderAmount);

      await expect(
        lendingMarketController
          .connect(bob)
          .depositAndExecuteOrder(
            hexWBTC,
            wBTCMaturities[0],
            Side.LEND,
            wbtcOrderAmount,
            '8000',
          ),
      ).to.not.emit(fundManagementLogic, 'OrderFilled');
    });

    // Test if the following error doesn't happen anymore
    // SF-467: calling getDepositAmount for a non-collateral currency with remaining lending orders after withdrawal caused an underflow error
    it('Withdraw all WFIL and WBTC deposit of bob and get deposit amount again', async () => {
      await tokenVault
        .connect(bob)
        .withdraw(hexWBTC, initialWBTCBalance.div(10))
        .then((tx) => tx.wait());

      await tokenVault
        .connect(bob)
        .withdraw(hexWFIL, initialFILBalance.div(2))
        .then((tx) => tx.wait());

      await expect(tokenVault.getDepositAmount(bob.address, hexWBTC)).not.to.be
        .reverted;
      await expect(tokenVault.getDepositAmount(bob.address, hexWFIL)).not.to.be
        .reverted;
    });
  });

  describe('Deposit and withdraw wFIL using MixinWallet', async () => {
    before(async () => {
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
    });
    it('Deposit wFIL on ReserveFund contract', async () => {
      const depositAmount = initialFILBalance.div(5);
      await wFILToken
        .connect(owner)
        .approve(reserveFund.address, depositAmount);

      // the owner of ReserveFund execute the approve and deposit transactions on behalf of the ReserveFund
      await expect(
        reserveFund.connect(owner).deposit(hexWFIL, depositAmount),
      ).to.emit(tokenVault, 'Deposit');

      const depositAmountAfter = await tokenVault.getDepositAmount(
        reserveFund.address,
        hexWFIL,
      );
      expect(depositAmountAfter.sub(depositAmount)).to.equal(0);
    });

    it('Withdraw all wFIL deposit on ReserveFund contract', async () => {
      const depositAmountBefore = await tokenVault.getDepositAmount(
        reserveFund.address,
        hexWFIL,
      );
      expect(depositAmountBefore).not.equal(0);

      const withdrawPayload = tokenVault.interface.encodeFunctionData(
        'withdraw(bytes32,uint256)',
        [hexWFIL, depositAmountBefore],
      );

      await expect(
        reserveFund
          .connect(owner)
          .executeTransaction(tokenVault.address, withdrawPayload, {}),
      ).to.emit(tokenVault, 'Withdraw');

      const depositAmountAfter = await tokenVault.getDepositAmount(
        reserveFund.address,
        hexWFIL,
      );
      expect(depositAmountAfter).to.equal(0);
    });

    it('Deposit wFIL on ReserveFund contract using wallet transactions', async () => {
      const depositAmount = initialFILBalance.div(5);
      // Move some wFIL to ReserveFund address first
      await wFILToken
        .connect(owner)
        .transfer(reserveFund.address, depositAmount);

      const approveData = wFILToken.interface.encodeFunctionData(
        'approve(address,uint256)',
        [tokenVault.address, depositAmount],
      );
      const depositData = tokenVault.interface.encodeFunctionData(
        'deposit(bytes32,uint256)',
        [hexWFIL, depositAmount],
      );
      // the owner of ReserveFund execute the approve and deposit transactions on behalf of the ReserveFund
      const targets = [wFILToken.address, tokenVault.address];
      const values = [0, 0];
      const data = [approveData, depositData];
      await expect(
        reserveFund
          .connect(owner)
          .executeTransactions(targets, values, data, {}),
      )
        .to.emit(reserveFund, 'TransactionsExecuted')
        .withArgs(owner.address, targets, values, data);

      const depositAmountAfter = await tokenVault.getDepositAmount(
        reserveFund.address,
        hexWFIL,
      );
      expect(depositAmountAfter.sub(depositAmount)).to.equal(0);
    });

    it('Withdraw all wFIL deposit on ReserveFund contract using wallet transaction', async () => {
      const depositAmountBefore = await tokenVault.getDepositAmount(
        reserveFund.address,
        hexWFIL,
      );
      expect(depositAmountBefore).not.equal(0);

      // Withdraw from the reservefund's fund
      const withdrawPayload = tokenVault.interface.encodeFunctionData(
        'withdraw(bytes32,uint256)',
        [hexWFIL, depositAmountBefore],
      );

      await expect(
        reserveFund
          .connect(owner)
          .executeTransaction(tokenVault.address, withdrawPayload, {}),
      ).to.emit(tokenVault, 'Withdraw');

      const depositAmountAfter = await tokenVault.getDepositAmount(
        reserveFund.address,
        hexWFIL,
      );
      expect(depositAmountAfter).to.equal(0);
    });

    it('Deposit wFIL on Liquidator contract', async () => {
      const depositAmount = initialFILBalance.div(5);
      // Move some wFIL to Liquidator address first
      await wFILToken.connect(owner).approve(liquidator.address, depositAmount);

      // the owner of Liquidator contract execute the approve and deposit transactions on behalf of the Liquidator
      await expect(
        liquidator.connect(owner).deposit(hexWFIL, depositAmount),
      ).to.emit(tokenVault, 'Deposit');

      const depositAmountAfter = await tokenVault.getDepositAmount(
        liquidator.address,
        hexWFIL,
      );
      expect(depositAmountAfter.sub(depositAmount)).to.equal(0);
    });

    it('Withdraw all wFIL deposit on Liquidator contract', async () => {
      const depositAmountBefore = await tokenVault.getDepositAmount(
        liquidator.address,
        hexWFIL,
      );
      expect(depositAmountBefore).not.equal(0);

      const withdrawPayload = tokenVault.interface.encodeFunctionData(
        'withdraw(bytes32,uint256)',
        [hexWFIL, depositAmountBefore],
      );

      await expect(
        liquidator
          .connect(owner)
          .executeTransaction(tokenVault.address, withdrawPayload, {}),
      ).to.emit(tokenVault, 'Withdraw');

      const depositAmountAfter = await tokenVault.getDepositAmount(
        liquidator.address,
        hexWFIL,
      );
      expect(depositAmountAfter).to.equal(0);
    });

    it('Deposit wFIL on Liquidator contract using wallet transactions', async () => {
      const depositAmount = initialFILBalance.div(5);
      // Move some wFIL to Liquidator address first
      await wFILToken
        .connect(owner)
        .transfer(liquidator.address, depositAmount);

      const approveData = wFILToken.interface.encodeFunctionData(
        'approve(address,uint256)',
        [tokenVault.address, depositAmount],
      );
      const depositData = tokenVault.interface.encodeFunctionData(
        'deposit(bytes32,uint256)',
        [hexWFIL, depositAmount],
      );
      // the owner of Liquidator execute the approve and deposit transactions on behalf of the Liquidator
      const targets = [wFILToken.address, tokenVault.address];
      const values = [0, 0];
      const data = [approveData, depositData];
      await expect(
        liquidator
          .connect(owner)
          .executeTransactions(
            [wFILToken.address, tokenVault.address],
            [0, 0],
            [approveData, depositData],
            {},
          ),
      )
        .to.emit(liquidator, 'TransactionsExecuted')
        .withArgs(owner.address, targets, values, data);

      const depositAmountAfter = await tokenVault.getDepositAmount(
        liquidator.address,
        hexWFIL,
      );
      expect(depositAmountAfter.sub(depositAmount)).to.equal(0);
    });

    it('Withdraw all wFIL deposit on liquidator contract using wallet transaction', async () => {
      const depositAmountBefore = await tokenVault.getDepositAmount(
        liquidator.address,
        hexWFIL,
      );
      expect(depositAmountBefore).not.equal(0);

      // Withdraw from the liquidator's fund
      const withdrawPayload = tokenVault.interface.encodeFunctionData(
        'withdraw(bytes32,uint256)',
        [hexWFIL, depositAmountBefore],
      );

      await expect(
        liquidator
          .connect(owner)
          .executeTransaction(tokenVault.address, withdrawPayload, {}),
      ).to.emit(tokenVault, 'Withdraw');

      const depositAmountAfter = await tokenVault.getDepositAmount(
        liquidator.address,
        hexWFIL,
      );
      expect(depositAmountAfter).to.equal(0);
    });
  });
});
