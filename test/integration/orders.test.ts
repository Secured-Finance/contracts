import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../../utils/constants';
import {
  deployContracts,
  LIQUIDATION_THRESHOLD_RATE,
} from '../../utils/deployment';
import { hexETHString, hexFILString } from '../../utils/strings';

const toWei = (eth) => {
  return ethers.utils.parseEther(eth);
};

describe('Integration Test: Orders', async () => {
  let ownerSigner: SignerWithAddress;
  let aliceSigner: SignerWithAddress;
  let bobSigner: SignerWithAddress;
  let carolSigner: SignerWithAddress;
  let daveSigner: SignerWithAddress;

  let addressResolver: Contract;
  let tokenVault: Contract;
  let currencyController: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let mockSwapRouter: Contract;

  let lendingMarkets: Contract[] = [];
  let ethLendingMarkets: Contract[] = [];
  let maturities: BigNumber[];

  let carolInitialCollateral = BigNumber.from('500000000000000000000');
  let orderAmountInETH = BigNumber.from('10000000000');

  before('Deploy Contracts', async () => {
    [ownerSigner, aliceSigner, bobSigner, carolSigner, daveSigner] =
      await ethers.getSigners();

    ({
      addressResolver,
      tokenVault,
      currencyController,
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
    await tokenVault.updateCurrency(hexFILString, true);

    for (const { address } of [
      aliceSigner,
      bobSigner,
      carolSigner,
      daveSigner,
    ]) {
      await wFILToken
        .connect(ownerSigner)
        .transfer(address, '1000000000000000000000');
    }

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexFILString)
        .then((tx) => tx.wait());
    }

    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexFILString)
      .then((addresses: string[]) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexETHString)
        .then((tx) => tx.wait());
    }

    ethLendingMarkets = await lendingMarketController
      .getLendingMarkets(hexETHString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
  });

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexFILString);
  });

  describe('Prepare markets and users for lending deals', async () => {
    it('Register collateral for Carol', async () => {
      let actualBalance = await wETHToken.balanceOf(tokenVault.address);
      expect(actualBalance.toString()).to.equal('0');

      await tokenVault
        .connect(carolSigner)
        .deposit(hexETHString, carolInitialCollateral.toString(), {
          value: carolInitialCollateral.toString(),
        })
        .then((tx) => tx.wait());

      expect(await wETHToken.balanceOf(tokenVault.address)).to.equal(
        carolInitialCollateral,
      );

      actualBalance = await wETHToken.balanceOf(tokenVault.address);
      expect(actualBalance.toString()).to.equal(
        carolInitialCollateral.toString(),
      );

      let currencies = await tokenVault.getUsedCurrencies(carolSigner.address);
      expect(currencies.includes(hexETHString)).to.equal(true);

      let collateralAmount = await tokenVault.getDepositAmount(
        carolSigner.address,
        hexETHString,
      );
      expect(collateralAmount.toString()).to.equal(
        carolInitialCollateral.toString(),
      );

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          carolSigner.address,
        );
      expect(totalPresentValue).to.equal('0');
    });

    it('Make lend orders by Carol', async () => {
      const ethMaturities: BigNumber[] =
        await lendingMarketController.getMaturities(hexETHString);

      await wFILToken
        .connect(carolSigner)
        .approve(tokenVault.address, '300000000000000000000')
        .then((tx) => tx.wait());

      const initialAmount = 30;
      const initialUnitPrice = 9000;
      for (const [idx, maturity] of maturities.entries()) {
        await expect(
          lendingMarketController
            .connect(carolSigner)
            .depositAndCreateOrder(
              hexFILString,
              maturity,
              Side.LEND,
              toWei(String(initialAmount + idx)),
              String(initialUnitPrice + 100 * idx),
            ),
        ).to.emit(lendingMarkets[idx], 'MakeOrder');
      }

      const initialUnitPriceETH = 300;
      for (const [idx, maturity] of ethMaturities.entries()) {
        await expect(
          lendingMarketController
            .connect(carolSigner)
            .createLendOrderWithETH(
              hexETHString,
              maturity,
              String(initialUnitPriceETH + 10 * idx),
              {
                value: toWei(String(initialAmount + idx)),
              },
            ),
        ).to.emit(ethLendingMarkets[idx], 'MakeOrder');
      }
    });

    it('Make borrow orders by Dave', async () => {
      const ethMaturities = await lendingMarketController.getMaturities(
        hexETHString,
      );

      const lendingMarkets = await lendingMarketController
        .getLendingMarkets(hexFILString)
        .then((addresses) =>
          Promise.all(
            addresses.map((address) =>
              ethers.getContractAt('LendingMarket', address),
            ),
          ),
        );
      const ethLendingMarkets = await lendingMarketController
        .getLendingMarkets(hexETHString)
        .then((addresses) =>
          Promise.all(
            addresses.map((address) =>
              ethers.getContractAt('LendingMarket', address),
            ),
          ),
        );

      const initialAmount = 30;
      const initialRate = 680;
      for (const [idx, maturity] of maturities.entries()) {
        await expect(
          lendingMarketController
            .connect(carolSigner)
            .createOrder(
              hexFILString,
              maturity,
              Side.BORROW,
              toWei(String(initialAmount + idx)),
              String(initialRate + 100 * idx),
            ),
        ).to.emit(lendingMarkets[idx], 'MakeOrder');
      }

      const initialRateETH = 270;
      for (const [idx, maturity] of ethMaturities.entries()) {
        await expect(
          lendingMarketController
            .connect(carolSigner)
            .createOrder(
              hexETHString,
              maturity,
              Side.BORROW,
              orderAmountInETH,
              String(initialRateETH + 10 * idx),
            ),
        ).to.emit(ethLendingMarkets[idx], 'MakeOrder');
      }
    });
  });

  describe('Deposit and Withdraw collateral by Alice', async () => {
    it('Deposit ETH by Alice (1st time)', async () => {
      let depositAmount = BigNumber.from('10000000000000000000');

      const currentBalance = await wETHToken.balanceOf(tokenVault.address);

      await tokenVault
        .connect(aliceSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      expect(await wETHToken.balanceOf(tokenVault.address)).to.equal(
        currentBalance.add(depositAmount),
      );

      const currencies = await tokenVault.getUsedCurrencies(
        aliceSigner.address,
      );
      expect(currencies.includes(hexETHString)).to.equal(true);

      let collateralAmount = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );
      expect(collateralAmount.toString()).to.equal(depositAmount.toString());
    });

    it('Deposit ETH by Alice (2nd time)', async () => {
      let depositAmount = BigNumber.from('13525252400000000000');

      const collateralAmountBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      await tokenVault
        .connect(aliceSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );
    });

    it('Withdraw ETH by Alice', async () => {
      let withdrawal = BigNumber.from('30000000000000000000');
      await tokenVault
        .connect(aliceSigner)
        .withdraw(hexETHString, withdrawal.toString())
        .then((tx) => tx.wait());

      let collateralAmount = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmount.toString()).to.equal('0');
    });

    it('Deposit ETH by Bob', async () => {
      let depositAmount = BigNumber.from('1000000000000000000');

      await tokenVault
        .connect(bobSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      let currencies = await tokenVault.getUsedCurrencies(bobSigner.address);
      expect(currencies.includes(hexETHString)).to.equal(true);

      let collateralAmount = await tokenVault.getDepositAmount(
        bobSigner.address,
        hexETHString,
      );
      expect(collateralAmount.toString()).to.equal(depositAmount.toString());
    });

    it('Withdraw ETH from empty collateral by Alice', async () => {
      let withdrawal = BigNumber.from('1000000000000000000');

      await tokenVault
        .connect(aliceSigner)
        .withdraw(hexETHString, withdrawal.toString())
        .then((tx) => tx.wait());
    });
  });

  describe('Make new orders on the FIL lending market, and check collateral usage', async () => {
    const orderAmount = '1000000000000000000';
    const depositAmount = '1500000000000000000';
    let orderAmountInFIL: string;

    before(async () => {
      orderAmountInFIL = await currencyController
        .connect(aliceSigner)
        .convertFromETH(hexFILString, orderAmount);
    });

    it('Deposit ETH by Alice in Collateral contract', async () => {
      const collateralAmountBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );
      await tokenVault
        .connect(aliceSigner)
        .deposit(hexETHString, depositAmount, {
          value: depositAmount,
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );
    });

    it('Expect revert on making order for 100 FIL', async () => {
      let depositAmountInFIL = await currencyController
        .connect(aliceSigner)
        .convertFromETH(hexFILString, depositAmount);

      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            depositAmountInFIL,
            '8700',
          ),
      ).to.be.revertedWith('Not enough collateral');
    });

    it('Make an order for FIL', async () => {
      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '8725',
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');
    });

    it('Check Alice collateral usage, and total working orders amount calculations', async () => {
      const orderAmountInETH = await currencyController
        .connect(aliceSigner)
        ['convertToETH(bytes32,uint256)'](hexFILString, orderAmountInFIL);

      const { totalWorkingBorrowOrdersAmount } =
        await lendingMarketController.calculateTotalFundsInETH(
          aliceSigner.address,
          ethers.utils.formatBytes32String(''),
          0,
        );

      expect(totalWorkingBorrowOrdersAmount.toString()).to.equal(
        orderAmountInETH.toString(),
      );
    });

    it('Calculate collateral coverage of the collateral, expect to be equal with manual calculations', async () => {
      const collateralAmount = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      const coverage = await tokenVault.getCoverage(aliceSigner.address);

      const { totalWorkingBorrowOrdersAmount } =
        await lendingMarketController.calculateTotalFundsInETH(
          aliceSigner.address,
          ethers.utils.formatBytes32String(''),
          0,
        );

      const manualCoverage = ethers.BigNumber.from(
        totalWorkingBorrowOrdersAmount.toString(),
      )
        .mul('10000')
        .div(collateralAmount.toString());

      expect(coverage.toNumber()).to.equal(manualCoverage.toNumber());
    });

    it('Withdraw maximum available amount instead of withdrawing input amount by Alice', async () => {
      const withdrawal = BigNumber.from('900000000000000000');

      const collateralAmountBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await tokenVault
        .connect(aliceSigner)
        .withdraw(hexETHString, withdrawal.toString())
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );
      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.sub(maxWithdrawal),
      );
    });

    it('Withdraw 0 instead of withdrawing 0.1 ETH by Alice', async () => {
      const withdrawal = BigNumber.from('100000000000000000');

      const collateralAmountBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await tokenVault
        .connect(aliceSigner)
        .withdraw(hexETHString, withdrawal.toString())
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.sub(maxWithdrawal),
      );
    });
  });

  describe('Release collateral by canceling lending orders FIL', async () => {
    it('Cancel an order for FIL', async () => {
      const tx = await lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(hexFILString, maturities[0], '3');

      await expect(tx).to.emit(lendingMarkets[0], 'CancelOrder');
      await tx.wait();

      const { totalWorkingBorrowOrdersAmount } =
        await lendingMarketController.calculateTotalFundsInETH(
          aliceSigner.address,
          ethers.utils.formatBytes32String(''),
          0,
        );
      expect(totalWorkingBorrowOrdersAmount.toString()).to.be.equal('0');

      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      const collateralAmount = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(maxWithdrawal.toString()).to.equal(collateralAmount.toString());
    });

    it('Cancel an order for ETH', async () => {
      const orderAmount = BigNumber.from('100000000000000000000');
      const ethMaturities: BigNumber[] =
        await lendingMarketController.getMaturities(hexETHString);

      await tokenVault
        .connect(daveSigner)
        .deposit(hexETHString, orderAmount.toString(), {
          value: orderAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralBefore = await tokenVault.getWithdrawableCollateral(
        daveSigner.address,
      );

      const receipt = await lendingMarketController
        .connect(daveSigner)
        .createLendOrderWithETH(hexETHString, ethMaturities[0], '1000', {
          value: orderAmount,
        })
        .then((tx) => tx.wait());

      const collateralAfterOrder = await tokenVault.getWithdrawableCollateral(
        daveSigner.address,
      );
      expect(collateralAfterOrder).to.equal(0);

      const events = await ethLendingMarkets[0].queryFilter(
        ethLendingMarkets[0].filters.MakeOrder(),
        receipt.blockHash,
      );
      const orderId = events[0].args?.orderId;

      await expect(
        lendingMarketController
          .connect(daveSigner)
          .cancelOrder(hexETHString, ethMaturities[0], orderId),
      ).to.emit(lendingMarketController, 'CancelOrder');

      const collateralAfterCancel = await tokenVault.getWithdrawableCollateral(
        daveSigner.address,
      );

      expect(collateralBefore).to.equal(collateralAfterCancel);
    });

    it('Withdraw left collateral by Alice', async () => {
      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await tokenVault
        .connect(aliceSigner)
        .withdraw(hexETHString, maxWithdrawal.toString())
        .then((tx) => tx.wait());

      const collateralAmount = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmount.toString()).to.equal('0');
    });
  });

  describe('Make an order on the FIL lending market by Alice, and take the order by Bob', async () => {
    const orderAmountInFIL = '30000000000000000000';
    const unitPrice = 8000;

    it('Deposit ETH by Alice', async () => {
      const depositAmount = BigNumber.from('1000000000000000000');

      const collateralAmountBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      await tokenVault
        .connect(aliceSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );
    });

    it('Make an order on the FIL lending market by Alice, take the order by Bob', async () => {
      const depositAmount = BigNumber.from('1000000000000000000');
      const aliceFILBalance: BigNumber = await wFILToken.balanceOf(
        aliceSigner.address,
      );

      await wFILToken
        .connect(aliceSigner)
        .approve(tokenVault.address, orderAmountInFIL)
        .then((tx) => tx.wait());
      await wFILToken
        .connect(daveSigner)
        .approve(tokenVault.address, orderAmountInFIL)
        .then((tx) => tx.wait());

      await tokenVault
        .connect(daveSigner)
        .deposit(hexETHString, '100000000', {
          value: '100000000',
        })
        .then((tx) => tx.wait());

      const collateralAmountAliceBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .depositAndCreateOrder(
            hexFILString,
            maturities[0],
            Side.LEND,
            orderAmountInFIL,
            unitPrice,
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await lendingMarketController
        .connect(daveSigner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.LEND,
          '100000000',
          unitPrice + 1,
        );
      await lendingMarketController
        .connect(daveSigner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          '100000000',
          unitPrice - 1,
        );

      expect(aliceFILBalance.sub(orderAmountInFIL)).to.equal(
        await wFILToken.balanceOf(aliceSigner.address),
      );

      const collateralETHAmountBobBefore = await tokenVault.getDepositAmount(
        bobSigner.address,
        hexETHString,
      );

      await tokenVault
        .connect(bobSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      await expect(
        lendingMarketController
          .connect(bobSigner)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            orderAmountInFIL,
            0,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      expect(aliceFILBalance.sub(orderAmountInFIL)).to.equal(
        await wFILToken.balanceOf(aliceSigner.address),
      );
      expect(
        await tokenVault.getDepositAmount(bobSigner.address, hexFILString),
      ).to.equal(orderAmountInFIL);

      const collateralAmountAliceAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );
      const collateralETHAmountBobAfter = await tokenVault.getDepositAmount(
        bobSigner.address,
        hexETHString,
      );
      const collateralFILAmountBob = await tokenVault.getDepositAmount(
        bobSigner.address,
        hexFILString,
      );
      expect(collateralETHAmountBobAfter).to.equal(
        collateralETHAmountBobBefore.add(depositAmount),
      );
      expect(collateralFILAmountBob).to.equal(orderAmountInFIL);

      const maxWithdrawalAliceAfter =
        await tokenVault.getWithdrawableCollateral(aliceSigner.address);
      const maxWithdrawalBob = await tokenVault.getWithdrawableCollateral(
        bobSigner.address,
      );
      const totalPresentValueBob =
        await lendingMarketController.getTotalPresentValueInETH(
          bobSigner.address,
        );

      expect(maxWithdrawalAliceAfter.toString()).to.equal(
        collateralAmountAliceBefore,
      );
      expect(collateralAmountAliceAfter.toString()).to.equal(
        collateralAmountAliceBefore,
      );

      const collateralFILAmountBobInETH = await currencyController[
        'convertToETH(bytes32,uint256)'
      ](hexFILString, collateralFILAmountBob);
      expect(maxWithdrawalBob).to.equal(
        collateralETHAmountBobAfter
          .add(collateralFILAmountBobInETH)
          .add(totalPresentValueBob.mul(125).div(100)),
      );
    });
  });

  describe('Make an order on the ETH lending market by Bob, and take the order by Alice', async () => {
    let unitPrice = 9800;
    let ethAmount = '1000000000000000000';

    it('Deposit ETH by Alice', async () => {
      const depositAmount = BigNumber.from('45000000000000000000');

      const collateralAmountBefore = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      await tokenVault
        .connect(aliceSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getDepositAmount(
        aliceSigner.address,
        hexETHString,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          hexETHString,
          aliceSigner.address,
        );
      expect(totalPresentValue).to.equal('0');
    });

    it('Make an order on the ETH lending market by Bob, take the order by Alice', async () => {
      const depositAmount = BigNumber.from('15000000000000000000');

      await tokenVault
        .connect(bobSigner)
        .deposit(hexETHString, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      await expect(
        lendingMarketController
          .connect(bobSigner)
          .createLendOrderWithETH(hexETHString, maturities[0], unitPrice, {
            value: ethAmount,
          }),
      ).to.emit(ethLendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(hexETHString, maturities[0], Side.BORROW, ethAmount, 0),
      ).to.emit(ethLendingMarkets[0], 'TakeOrders');
    });
  });

  describe('Make orders on the FIL lending market, take the orders by the limit order', async () => {
    const getUnusedCollateral = async (
      signer: SignerWithAddress,
    ): Promise<BigNumber> => {
      let collateralAmount = await tokenVault.getUnusedCollateral(
        signer.address,
      );

      if (collateralAmount.toString() === '0') {
        collateralAmount = BigNumber.from('1000000000000000');
        const collateralAmountInETH = await currencyController.convertFromETH(
          hexFILString,
          collateralAmount,
        );
        await tokenVault
          .connect(signer)
          .deposit(hexETHString, collateralAmountInETH, {
            value: collateralAmountInETH,
          })
          .then((tx) => tx.wait());
      }

      return collateralAmount;
    };

    const inputs = [
      {
        side1: Side.BORROW,
        side2: Side.LEND,
        signer1: 'bob',
        signer2: 'alice',
        label: 'lending',
      },
      {
        side1: Side.LEND,
        side2: Side.BORROW,
        signer1: 'alice',
        signer2: 'bob',
        label: 'borrowing',
      },
    ];

    for (const input of inputs) {
      it(`The case that the ${input.label} input and filled order have the same amount`, async () => {
        const signer1 = input.signer1 === 'bob' ? bobSigner : aliceSigner;
        const signer2 = input.signer2 === 'bob' ? bobSigner : aliceSigner;
        const collateralAmount = await getUnusedCollateral(bobSigner);

        await wFILToken
          .connect(aliceSigner)
          .approve(tokenVault.address, collateralAmount)
          .then((tx) => tx.wait());
        await tokenVault
          .connect(aliceSigner)
          .deposit(hexFILString, collateralAmount, { value: collateralAmount })
          .then((tx) => tx.wait());

        await expect(
          lendingMarketController
            .connect(signer1)
            .createOrder(
              hexFILString,
              maturities[1],
              input.side1,
              collateralAmount,
              '9001',
            ),
        ).to.emit(lendingMarkets[1], 'MakeOrder');

        await expect(
          lendingMarketController
            .connect(signer2)
            .createOrder(
              hexFILString,
              maturities[1],
              input.side2,
              collateralAmount,
              '9001',
            ),
        ).to.emit(lendingMarkets[1], 'TakeOrders');
      });

      it(`The case that the filled order amount is bigger than the ${input.label} input`, async () => {
        const signer1 = input.signer1 === 'bob' ? bobSigner : aliceSigner;
        const signer2 = input.signer2 === 'bob' ? bobSigner : aliceSigner;
        const collateralAmount = await getUnusedCollateral(bobSigner);

        await wFILToken
          .connect(aliceSigner)
          .approve(tokenVault.address, collateralAmount)
          .then((tx) => tx.wait());
        await tokenVault
          .connect(aliceSigner)
          .deposit(hexFILString, collateralAmount, { value: collateralAmount })
          .then((tx) => tx.wait());

        await expect(
          lendingMarketController
            .connect(signer1)
            .createOrder(
              hexFILString,
              maturities[2],
              input.side1,
              collateralAmount,
              '9002',
            ),
        ).to.emit(lendingMarkets[2], 'MakeOrder');

        await expect(
          lendingMarketController
            .connect(signer2)
            .createOrder(
              hexFILString,
              maturities[2],
              input.side2,
              collateralAmount.div(2),
              '9002',
            ),
        ).to.emit(lendingMarkets[2], 'TakeOrders');
      });

      it(`The case that the filled order amount is less than the ${input.label} input`, async () => {
        const signer1 = input.signer1 === 'bob' ? bobSigner : aliceSigner;
        const signer2 = input.signer2 === 'bob' ? bobSigner : aliceSigner;
        const collateralAmount = await getUnusedCollateral(bobSigner);

        await wFILToken
          .connect(aliceSigner)
          .approve(tokenVault.address, collateralAmount.mul(3))
          .then((tx) => tx.wait());
        await tokenVault
          .connect(aliceSigner)
          .deposit(hexFILString, collateralAmount.mul(3), {
            value: collateralAmount.mul(3),
          })
          .then((tx) => tx.wait());

        await expect(
          lendingMarketController
            .connect(signer1)
            .createOrder(
              hexFILString,
              maturities[3],
              input.side1,
              collateralAmount.div(2),
              '9003',
            ),
        ).to.emit(lendingMarkets[3], 'MakeOrder');
        await expect(
          lendingMarketController
            .connect(signer1)
            .createOrder(
              hexFILString,
              maturities[3],
              input.side1,
              collateralAmount.div(2),
              '9003',
            ),
        ).to.emit(lendingMarkets[3], 'MakeOrder');

        await expect(
          lendingMarketController
            .connect(signer2)
            .createOrder(
              hexFILString,
              maturities[3],
              input.side2,
              collateralAmount.mul(2),
              '9003',
            ),
        ).to.emit(lendingMarkets[3], 'TakeOrders');
      });
    }
  });
});
