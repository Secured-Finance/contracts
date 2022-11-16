import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

import { Side } from '../utils/constants';
import { deployContracts } from '../utils/deployment';
import { filToETHRate, toBN } from '../utils/numbers';
import { hexETHString, hexFILString } from '../utils/strings';

const toWei = (eth) => {
  return ethers.utils.parseEther(eth);
};

describe('Integration test', async () => {
  let ownerSigner: SignerWithAddress;
  let aliceSigner: SignerWithAddress;
  let bobSigner: SignerWithAddress;
  let carolSigner: SignerWithAddress;
  let daveSigner: SignerWithAddress;

  const targetCurrency = hexETHString;

  let tokenVault: Contract;
  let currencyController: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wFILToken: Contract;
  let filToETHPriceFeed: Contract;

  let lendingMarkets: Contract[] = [];
  let ethLendingMarkets: Contract[] = [];
  let maturities: BigNumber[];

  let carolInitialCollateral = toBN('500000000000000000000');
  let orderAmountInETH = toBN('10000000000');

  before('Deploy Contracts', async () => {
    [ownerSigner, aliceSigner, bobSigner, carolSigner, daveSigner] =
      await ethers.getSigners();

    ({
      tokenVault,
      currencyController,
      lendingMarketController,
      wETHToken,
      wFILToken,
      filToETHPriceFeed,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address);

    await tokenVault.registerCurrency(hexFILString, wFILToken.address);

    await wFILToken
      .connect(ownerSigner)
      .transfer(aliceSigner.address, '1000000000000000000000');
    await wFILToken
      .connect(ownerSigner)
      .transfer(bobSigner.address, '1000000000000000000000');
    await wFILToken
      .connect(ownerSigner)
      .transfer(carolSigner.address, '1000000000000000000000');
    await wFILToken
      .connect(ownerSigner)
      .transfer(daveSigner.address, '1000000000000000000000');

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

  beforeEach('Deploy Contracts', async () => {
    maturities = await lendingMarketController.getMaturities(hexFILString);
  });

  describe('Prepare markets and users for lending deals', async () => {
    it('Register collateral for Carol with 90 ETH and check Carol collateral', async () => {
      let actualBalance = await wETHToken.balanceOf(tokenVault.address);
      expect(actualBalance.toString()).to.equal('0');

      await tokenVault
        .connect(carolSigner)
        .deposit(targetCurrency, carolInitialCollateral.toString(), {
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
      expect(currencies.includes(targetCurrency)).to.equal(true);

      let collateralAmount = await tokenVault.getCollateralAmount(
        carolSigner.address,
        targetCurrency,
      );
      expect(collateralAmount.toString()).to.equal(
        carolInitialCollateral.toString(),
      );

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
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

    it('Make borrow orders by Carol', async () => {
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
    it('Deposit 10 ETH by Alice in Collateral contract', async () => {
      let depositAmount = toBN('10000000000000000000');

      const currentBalance = await wETHToken.balanceOf(tokenVault.address);

      await tokenVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      expect(await wETHToken.balanceOf(tokenVault.address)).to.equal(
        currentBalance.add(depositAmount),
      );

      const currencies = await tokenVault.getUsedCurrencies(
        aliceSigner.address,
      );
      expect(currencies.includes(targetCurrency)).to.equal(true);

      let collateralAmount = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );
      expect(collateralAmount.toString()).to.equal(depositAmount.toString());
    });

    it('Deposit 13.5252524 ETH by Alice in Collateral contract', async () => {
      let depositAmount = toBN('13525252400000000000');

      const collateralAmountBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      await tokenVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );
    });

    it('Try to Withdraw 30 ETH from Collateral by Alice but withdraw maximum amount of independent collateral, ', async () => {
      let withdrawal = toBN('30000000000000000000');
      await tokenVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      let collateralAmount = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(collateralAmount.toString()).to.equal('0');
    });

    it('Register collateral by Bob with 1 ETH deposit', async () => {
      let depositAmount = toBN('1000000000000000000');

      await tokenVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      let currencies = await tokenVault.getUsedCurrencies(bobSigner.address);
      expect(currencies.includes(targetCurrency)).to.equal(true);

      let collateralAmount = await tokenVault.getCollateralAmount(
        bobSigner.address,
        targetCurrency,
      );
      expect(collateralAmount.toString()).to.equal(depositAmount.toString());
    });

    it('Deposit 2 ETH by Bob in Collateral contract', async () => {
      let depositAmount = toBN('2000000000000000000');
      await tokenVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      let collateralAmount = await tokenVault.getCollateralAmount(
        bobSigner.address,
        targetCurrency,
      );

      expect(collateralAmount.toString()).to.equal('3000000000000000000');
    });

    it('Try to withdraw 1 ETH from empty collateral book by Alice, expect no change in Alice balance', async () => {
      let withdrawal = toBN('1000000000000000000');

      await tokenVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());
    });
  });

  describe('Make new orders on FIL LendingMarket, and check collateral usage', async () => {
    const orderAmount = '1000000000000000000';
    const depositAmount = '1500000000000000000';
    let orderAmountInFIL: string;

    before(async () => {
      orderAmountInFIL = await currencyController
        .connect(aliceSigner)
        .convertFromETH(hexFILString, orderAmount);
    });

    it('Deposit ETH by Alice in Collateral contract', async () => {
      const collateralAmountBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );
      await tokenVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmount, {
          value: depositAmount,
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
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
            '700',
          ),
      ).to.be.revertedWith('Not enough collateral');
    });

    it('Successfully make order for 10 FIL', async () => {
      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(
            hexFILString,
            maturities[0],
            Side.BORROW,
            orderAmountInFIL,
            '725',
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');
    });

    it('Check Alice collateral usage, and total working orders amount calculations', async () => {
      const orderAmountInETH = await currencyController
        .connect(aliceSigner)
        ['convertToETH(bytes32,uint256)'](hexFILString, orderAmountInFIL);

      const { totalWorkingOrdersAmount } =
        await lendingMarketController.calculateTotalBorrowedFundsInETH(
          aliceSigner.address,
        );

      expect(totalWorkingOrdersAmount.toString()).to.equal(
        orderAmountInETH.toString(),
      );
    });

    it('Calculate collateral coverage of the collateral, expect to be equal with manual calculations', async () => {
      const collateralAmount = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      const coverage = await tokenVault.getCoverage(aliceSigner.address);

      const { totalWorkingOrdersAmount } =
        await lendingMarketController.calculateTotalBorrowedFundsInETH(
          aliceSigner.address,
        );

      const manualCoverage = ethers.BigNumber.from(
        totalWorkingOrdersAmount.toString(),
      )
        .mul('10000')
        .div(collateralAmount.toString());

      expect(coverage.toNumber()).to.equal(manualCoverage.toNumber());
    });

    it('Expect withdrawing maximum available amount instead of withdrawing 0.9 ETH by Alice', async () => {
      const withdrawal = toBN('900000000000000000');

      const collateralAmountBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await tokenVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );
      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.sub(maxWithdrawal),
      );
    });

    it('Expect withdrawing 0 instead of withdrawing 0.1 ETH by Alice', async () => {
      const withdrawal = toBN('100000000000000000');

      const collateralAmountBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await tokenVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.sub(maxWithdrawal),
      );
    });
  });

  describe('Release collateral functions by canceling lending orders FIL', async () => {
    it('Successfully cancel order for FIL', async () => {
      const tx = await lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(hexFILString, maturities[0], '3');

      await expect(tx).to.emit(lendingMarkets[0], 'CancelOrder');
      await tx.wait();

      const { totalWorkingOrdersAmount } =
        await lendingMarketController.calculateTotalBorrowedFundsInETH(
          aliceSigner.address,
        );
      expect(totalWorkingOrdersAmount.toString()).to.be.equal('0');

      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      const collateralAmount = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(maxWithdrawal.toString()).to.equal(collateralAmount.toString());
    });

    it('Successfully cancel order for ETH', async () => {
      const orderAmount = toBN('100000000000000000000');
      const ethMaturities: BigNumber[] =
        await lendingMarketController.getMaturities(hexETHString);

      await tokenVault
        .connect(daveSigner)
        .deposit(targetCurrency, orderAmount.toString(), {
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

    it('Successfully withdraw left collateral by Alice', async () => {
      const maxWithdrawal = await tokenVault.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await tokenVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, maxWithdrawal.toString())
        .then((tx) => tx.wait());

      const collateralAmount = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(collateralAmount.toString()).to.equal('0');
    });
  });

  describe('Make new orders on FIL LendingMarket by Alice, and taking orders by Bob', async () => {
    const orderAmountInFIL = '30000000000000000000';
    const unitPrice = 8000;

    it('Deposit 1 ETH by Alice in Collateral contract', async () => {
      const depositAmount = toBN('1000000000000000000');

      const collateralAmountBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      await tokenVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );
    });

    it('Successfully make order for 30 FIL by Alice, take this order by Bob', async () => {
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

      const collateralAmountAliceBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );
      const maxWithdrawalAliceBefore =
        await tokenVault.getWithdrawableCollateral(aliceSigner.address);

      const depositAmount = toBN('1000000000000000000');
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
          '100',
          unitPrice + 1,
        );
      await lendingMarketController
        .connect(daveSigner)
        .depositAndCreateOrder(
          hexFILString,
          maturities[0],
          Side.BORROW,
          '100',
          unitPrice - 1,
        );

      expect(aliceFILBalance.sub(orderAmountInFIL)).to.equal(
        await wFILToken.balanceOf(aliceSigner.address),
      );

      await tokenVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
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
            unitPrice,
          ),
      ).to.emit(lendingMarkets[0], 'TakeOrders');

      expect(aliceFILBalance.sub(orderAmountInFIL)).to.equal(
        await wFILToken.balanceOf(aliceSigner.address),
      );
      expect(
        await tokenVault.getCollateralAmount(bobSigner.address, hexFILString),
      ).to.equal(orderAmountInFIL);

      const collateralAmountAliceAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );
      const collateralAmountBob = await tokenVault.getCollateralAmount(
        bobSigner.address,
        targetCurrency,
      );

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
      expect(maxWithdrawalBob.toString()).to.equal(
        collateralAmountBob.add(totalPresentValueBob.div(2)).toString(),
      );
    });
  });

  describe('Second loan by Alice and Bob for 1 ETH', async () => {
    let unitPrice = '800';
    let ethAmount = '1000000000000000000';

    it('Deposit 45 ETH by Alice in Collateral contract', async () => {
      const depositAmount = toBN('45000000000000000000');

      const collateralAmountBefore = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      await tokenVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
          value: depositAmount.toString(),
        })
        .then((tx) => tx.wait());

      const collateralAmountAfter = await tokenVault.getCollateralAmount(
        aliceSigner.address,
        targetCurrency,
      );

      expect(collateralAmountAfter).to.equal(
        collateralAmountBefore.add(depositAmount),
      );

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          aliceSigner.address,
        );
      expect(totalPresentValue).to.equal('0');
    });

    it('Successfully make order for 1 ETH by Bob, deposit 15 ETH by Bob, take this order by Alice', async () => {
      const depositAmount = toBN('15000000000000000000');
      const maturities = await lendingMarketController.getMaturities(
        hexETHString,
      );

      await tokenVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmount.toString(), {
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
          .createOrder(
            hexETHString,
            maturities[0],
            Side.BORROW,
            ethAmount,
            unitPrice,
          ),
      ).to.emit(ethLendingMarkets[0], 'TakeOrders');
    });
  });

  describe('Place and Fill the limit orders on FIL market', async () => {
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
          .deposit(targetCurrency, collateralAmountInETH, {
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
          .approve(tokenVault.address, collateralAmount.mul(2))
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

  describe('Liquidations for registered loans', async () => {
    it('Increase FIL exchange rate by 25%, check collateral coverage', async () => {
      await tokenVault
        .connect(bobSigner)
        .deposit(hexETHString, '1000000000000000000', {
          value: carolInitialCollateral.toString(),
        })
        .then((tx) => tx.wait());

      const bobCoverageBefore = await tokenVault.getCoverage(bobSigner.address);

      await lendingMarketController
        .connect(bobSigner)
        .createOrder(
          hexETHString,
          maturities[1],
          Side.BORROW,
          '500000000000000000',
          '9990',
        )
        .then((tx) => tx.wait());

      const newPrice = filToETHRate.mul('125').div('100');
      await filToETHPriceFeed.updateAnswer(newPrice);

      const bobCoverageAfter = await tokenVault.getCoverage(bobSigner.address);

      expect(bobCoverageBefore.toString()).not.to.equal(
        bobCoverageAfter.toString(),
      );
    });
  });
});
