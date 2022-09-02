import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { ethers, web3 } from 'hardhat';

import { checkTokenBalances } from '../test-utils/balances';
import { deployContracts } from '../test-utils/deployment';
import { filToETHRate, toBN } from '../test-utils/numbers';
import {
  hexBTCString,
  hexETHString,
  hexFILString,
} from '../test-utils/strings';

const toWei = (eth) => {
  return ethers.utils.parseEther(eth);
};

describe('Integration test', async () => {
  let aliceSigner: SignerWithAddress;
  let bobSigner: SignerWithAddress;
  let carolSigner: SignerWithAddress;

  const targetCurrency = hexETHString;

  let collateralAggregator: any;
  let collateralVault: any;
  let lendingMarketController: any;

  let currencyController: any;
  let wETHToken: any;

  let filToETHPriceFeed: any;

  let lendingMarkets = [];
  let btcLendingMarkets = [];

  let aliceIndependentAmount = toBN('0');
  let carolInitialCollateral = toBN('90000000000000000000');

  before('Deploy Contracts', async () => {
    [, aliceSigner, bobSigner, carolSigner] = await ethers.getSigners();

    ({
      collateralAggregator,
      collateralVault,
      currencyController,
      lendingMarketController,
      wETHToken,
      filToETHPriceFeed,
    } = await deployContracts());

    await collateralVault.registerCurrency(targetCurrency, wETHToken.address);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 4; i++) {
      const receipt = await lendingMarketController
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

    // Deploy Lending Markets for BTC market
    for (let i = 0; i < 4; i++) {
      const receipt = await lendingMarketController
        .createLendingMarket(hexBTCString)
        .then((tx) => tx.wait());
    }

    btcLendingMarkets = await lendingMarketController
      .getLendingMarkets(hexBTCString)
      .then((addresses) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );
  });

  describe('Prepare markets and users for lending deals', async () => {
    it('Register collateral book for Carol with 90 ETH and check Carol collateral book', async () => {
      await collateralAggregator.connect(carolSigner).register();

      let actualBalance = await wETHToken.balanceOf(collateralVault.address);
      expect(actualBalance.toString()).to.equal('0');

      await collateralVault
        .connect(carolSigner)
        .deposit(targetCurrency, carolInitialCollateral.toString(), {
          value: carolInitialCollateral.toString(),
        })
        .then((tx) => tx.wait());

      await checkTokenBalances(
        [collateralVault.address],
        [carolInitialCollateral],
        wETHToken,
      );

      actualBalance = await wETHToken.balanceOf(collateralVault.address);
      expect(actualBalance.toString()).to.equal(
        carolInitialCollateral.toString(),
      );

      let currencies = await collateralVault.getUsedCurrencies(
        carolSigner.address,
      );
      expect(currencies.includes(targetCurrency)).to.equal(true);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          carolSigner.address,
          targetCurrency,
        );
      expect(independentCollateral.toString()).to.equal(
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
      const [_3mMaturity, _6mMaturity, _9mMaturity, _1yMaturity] =
        await lendingMarketController.getMaturities(hexFILString);
      const [_3mBtcMaturity, _6mBtcMaturity, _9mBtcMaturity, _1yBtcMaturity] =
        await lendingMarketController.getMaturities(hexBTCString);

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _3mMaturity, '0', toWei('300'), '920'),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _3mBtcMaturity, '0', '1000000000', '300'),
      ).to.emit(btcLendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _6mMaturity, '0', toWei('310'), '1020'),
      ).to.emit(lendingMarkets[1], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _6mBtcMaturity, '0', '1000000000', '310'),
      ).to.emit(btcLendingMarkets[1], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _9mMaturity, '0', toWei('320'), '1120'),
      ).to.emit(lendingMarkets[2], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _9mBtcMaturity, '0', '1000000000', '320'),
      ).to.emit(btcLendingMarkets[2], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _1yMaturity, '0', toWei('330'), '1220'),
      ).to.emit(lendingMarkets[3], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _1yBtcMaturity, '0', '1000000000', '330'),
      ).to.emit(btcLendingMarkets[3], 'MakeOrder');
    });

    it('Make borrow orders by Carol', async () => {
      const [_3mMaturity, _6mMaturity, _9mMaturity, _1yMaturity] =
        await lendingMarketController.getMaturities(hexFILString);
      const [_3mBtcMaturity, _6mBtcMaturity, _9mBtcMaturity, _1yBtcMaturity] =
        await lendingMarketController.getMaturities(hexBTCString);

      const lendingMarkets = await lendingMarketController
        .getLendingMarkets(hexFILString)
        .then((addresses) =>
          Promise.all(
            addresses.map((address) =>
              ethers.getContractAt('LendingMarket', address),
            ),
          ),
        );
      const btcLendingMarkets = await lendingMarketController
        .getLendingMarkets(hexBTCString)
        .then((addresses) =>
          Promise.all(
            addresses.map((address) =>
              ethers.getContractAt('LendingMarket', address),
            ),
          ),
        );

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _3mMaturity, '1', toWei('300'), '680'),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _3mBtcMaturity, '1', '1000000000', '270'),
      ).to.emit(btcLendingMarkets[0], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _6mMaturity, '1', toWei('310'), '780'),
      ).to.emit(lendingMarkets[1], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _6mBtcMaturity, '1', '1000000000', '280'),
      ).to.emit(btcLendingMarkets[1], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _9mMaturity, '1', toWei('320'), '880'),
      ).to.emit(lendingMarkets[2], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _9mBtcMaturity, '1', '1000000000', '290'),
      ).to.emit(btcLendingMarkets[2], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexFILString, _1yMaturity, '1', toWei('330'), '980'),
      ).to.emit(lendingMarkets[3], 'MakeOrder');

      await expect(
        lendingMarketController
          .connect(carolSigner)
          .createOrder(hexBTCString, _1yBtcMaturity, '1', '1000000000', '300'),
      ).to.emit(btcLendingMarkets[3], 'MakeOrder');
    });
  });

  describe('Test Deposit and Withdraw collateral by Alice', async () => {
    it('Register collateral book without payment', async () => {
      await expect(
        collateralAggregator.connect(aliceSigner).register(),
      ).to.emit(collateralAggregator, 'Register');
    });

    it('Deposit 10 ETH by Alice in Collateral contract', async () => {
      let depositAmt = toBN('10000000000000000000');

      await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      await checkTokenBalances(
        [collateralVault.address],
        [carolInitialCollateral.add(depositAmt)],
        wETHToken,
      );

      let currencies = await collateralVault.getUsedCurrencies(
        aliceSigner.address,
      );
      expect(currencies.includes(targetCurrency)).to.equal(true);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );
      expect(independentCollateral.toString()).to.equal(depositAmt.toString());

      aliceIndependentAmount = depositAmt;
    });

    it('Deposit 13.5252524 ETH by Alice in Collateral contract', async () => {
      let depositAmt = toBN('13525252400000000000');

      await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      aliceIndependentAmount = aliceIndependentAmount.add(depositAmt);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Try to Withdraw 30 ETH from Collateral by Alice but withdraw maximum amount of independent collateral, ', async () => {
      let withdrawal = toBN('30000000000000000000');
      await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal('0');

      aliceIndependentAmount = aliceIndependentAmount.sub(
        aliceIndependentAmount,
      );
    });

    it('Register collateral book by Bob with 1 ETH deposit', async () => {
      await expect(collateralAggregator.connect(bobSigner).register()).to.emit(
        collateralAggregator,
        'Register',
      );

      let depositAmt = toBN('1000000000000000000');

      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      let currencies = await collateralVault.getUsedCurrencies(
        bobSigner.address,
      );
      expect(currencies.includes(targetCurrency)).to.equal(true);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          bobSigner.address,
          targetCurrency,
        );
      expect(independentCollateral.toString()).to.equal(depositAmt.toString());
    });

    it('Deposit 2 ETH by Bob in Collateral contract', async () => {
      let depositAmt = toBN('2000000000000000000');
      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          bobSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal('3000000000000000000');
    });

    it('Try to withdraw 1 ETH from empty collateral book by Alice, expect no change in Alice balance', async () => {
      let withdrawal = toBN('1000000000000000000');

      await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());
    });
  });

  describe('Test making new orders on FIL LendingMarket, and check collateral usage', async () => {
    it('Deposit 1 ETH by Alice in Collateral contract', async () => {
      let depositAmt = toBN('1000000000000000000');

      await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      aliceIndependentAmount = aliceIndependentAmount.add(depositAmt);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Expect revert on making order for 100 FIL', async () => {
      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
      );
      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(
            hexFILString,
            maturities[0],
            '0',
            '100000000000000000000',
            '700',
          ),
      ).to.be.revertedWith('Not enough collateral');
    });

    it('Successfully make order for 10 FIL', async () => {
      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
      );

      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(
            hexFILString,
            maturities[0],
            '0',
            '10000000000000000000',
            '725',
          ),
      ).to.emit(lendingMarkets[0], 'MakeOrder');
    });

    it('Check Alice collateral book usage, and total unsettled exposure calculations', async () => {
      let filUsed = toBN('10000000000000000000')
        .mul(toBN(2000))
        .div(toBN(10000));

      let filInETH = await currencyController
        .connect(aliceSigner)
        ['convertToETH(bytes32,uint256)'](hexFILString, filUsed);

      let exp = await collateralAggregator.getTotalUnsettledExposure(
        aliceSigner.address,
      );
      expect(exp.toString()).to.equal(filInETH.toString());

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Calculate collateral coverage of the global collateral book, expect to be equal with manual calculations', async () => {
      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );

      let coverage = await collateralAggregator.getCoverage(
        aliceSigner.address,
      );

      const totalUnsettledExp =
        await collateralAggregator.getTotalUnsettledExposure(
          aliceSigner.address,
        );

      let manualCoverage = ethers.BigNumber.from(totalUnsettledExp.toString())
        .mul('10000')
        .div(independentCollateral.toString());

      expect(coverage.toNumber()).to.equal(manualCoverage.toNumber());
    });

    it('Expect withdrawing maximum available amount instead of withdrawing 0.9 ETH by Alice', async () => {
      let withdrawal = toBN('900000000000000000');
      let maxWithdrawal = await collateralAggregator.getWithdrawableCollateral(
        aliceSigner.address,
      );

      await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      aliceIndependentAmount = aliceIndependentAmount.sub(maxWithdrawal);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Expect withdrawing 0 instead of withdrawing 0.1 ETH by Alice', async () => {
      let maxWithdrawal = await collateralAggregator.getWithdrawableCollateral(
        aliceSigner.address,
      );
      let withdrawal = toBN('100000000000000000');

      (
        await collateralVault
          .connect(aliceSigner)
          .withdraw(targetCurrency, withdrawal.toString())
      ).wait();

      aliceIndependentAmount = await aliceIndependentAmount.sub(maxWithdrawal);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });
  });

  describe('Test release collateral functions by canceling lending orders FIL', async () => {
    it('Successfully cancel order for 100 FIL, expect independent amount to be fully unlocked', async () => {
      let balance;
      let gasPrice;

      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
      );

      await web3.eth.getGasPrice().then((res) => (gasPrice = toBN(res)));
      await web3.eth
        .getBalance(aliceSigner.address)
        .then((res) => (balance = toBN(res)));

      let tx = await lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(hexFILString, maturities[0], '3');

      await expect(tx).to.emit(lendingMarkets[0], 'CancelOrder');

      const receipt = await tx.wait();
      if (receipt.gasUsed != null) {
        balance = await balance.sub(toBN(receipt.gasUsed).mul(gasPrice));
      }

      const totalUnsettledExp =
        await collateralAggregator.getTotalUnsettledExposure(
          aliceSigner.address,
        );
      expect(totalUnsettledExp.toString()).to.be.equal('0');

      let maxWithdrawal = await collateralAggregator.getWithdrawableCollateral(
        aliceSigner.address,
      );

      expect(maxWithdrawal.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Successfully widthdraw left collateral by Alice', async () => {
      let maxWithdrawal = await collateralAggregator.getWithdrawableCollateral(
        aliceSigner.address,
      );
      let withdrawal = toBN('1000000000000000000');

      aliceIndependentAmount = aliceIndependentAmount.sub(maxWithdrawal);

      await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal('0');
    });
  });

  describe('Test making new orders on FIL LendingMarket by Alice, and taking orders by Bob', async () => {
    let filAmount = '30000000000000000000';
    let rate = '725';

    it('Deposit 1 ETH by Alice in Collateral contract', async () => {
      let depositAmt = toBN('1000000000000000000');

      await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      aliceIndependentAmount = aliceIndependentAmount.add(depositAmt);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Successfully make order for 30 FIL by Alice, take this order by Bob', async () => {
      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
      );

      let depositAmt = toBN('1000000000000000000');
      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(hexFILString, maturities[0], '0', filAmount, rate),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      let filInETH = await currencyController
        .connect(aliceSigner)
        ['convertToETH(bytes32,uint256)'](hexFILString, filAmount);
      console.log('FIL in ETH is: ' + filInETH);
      console.log('Taking order for 30 FIL, and using collateral');

      await expect(
        lendingMarketController
          .connect(bobSigner)
          .createOrder(hexFILString, maturities[0], '1', filAmount, rate),
      ).to.emit(lendingMarkets[0], 'TakeOrder');

      const independentCollateralAlice =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );
      const independentCollateralBob =
        await collateralVault.getIndependentCollateral(
          bobSigner.address,
          targetCurrency,
        );

      const maxWithdrawalAlice =
        await collateralAggregator.getWithdrawableCollateral(
          aliceSigner.address,
        );
      const maxWithdrawalBob =
        await collateralAggregator.getWithdrawableCollateral(bobSigner.address);

      const totalPresentValueBob =
        await lendingMarketController.getTotalPresentValueInETH(
          bobSigner.address,
        );

      expect(maxWithdrawalAlice.toString()).to.equal(
        independentCollateralAlice.toString(),
      );
      expect(maxWithdrawalBob.toString()).to.equal(
        independentCollateralBob
          .mul('10')
          .add(totalPresentValueBob.mul('15'))
          .div('10')
          .toString(),
      );

      const bobCoverage = await collateralAggregator.getCoverage(
        bobSigner.address,
      );
      const aliceCoverage = await collateralAggregator.getCoverage(
        aliceSigner.address,
      );

      console.group('Collateral coverage for:');
      console.log('Bob (borrower) of 30 FIL is ' + bobCoverage.toString());
      console.log('Alice (lender) of 30 FIL is ' + aliceCoverage.toString());
      console.groupEnd();
    });
  });

  describe('Test second loan by Alice and Bob for 1 BTC', async () => {
    let rate = '800';
    let btcAmount = '1000000000000000000';

    it('Deposit 45 ETH by Alice in Collateral contract', async () => {
      const depositAmt = toBN('45000000000000000000');

      await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

      const independentCollateral =
        await collateralVault.getIndependentCollateral(
          aliceSigner.address,
          targetCurrency,
        );

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          aliceSigner.address,
        );
      expect(totalPresentValue).to.equal('0');
    });

    it('Successfully make order for 1 BTC by Bob, deposit 15 ETH by Bob, take this order by Alice', async () => {
      let depositAmt = toBN('15000000000000000000');
      const maturities = await lendingMarketController.getMaturities(
        hexBTCString,
      );

      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      console.log('Making a new order to lend 1 BTC for 5 years by Bob');

      await expect(
        lendingMarketController
          .connect(bobSigner)
          .createOrder(hexBTCString, maturities[0], '0', btcAmount, rate),
      ).to.emit(btcLendingMarkets[0], 'MakeOrder');

      console.log(
        'Taking order for 1 BTC, and using collateral by Alice as a borrower',
      );

      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(hexBTCString, maturities[0], '1', btcAmount, rate),
      ).to.emit(btcLendingMarkets[0], 'TakeOrder');

      let btcInETH = await currencyController
        .connect(aliceSigner)
        ['convertToETH(bytes32,uint256)'](hexBTCString, btcAmount);

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          aliceSigner.address,
        );

      aliceIndependentAmount = aliceIndependentAmount.sub(
        toBN(totalPresentValue),
      );

      console.log('BTC in ETH is: ' + btcInETH);

      const bobCoverage = await collateralAggregator.getCoverage(
        bobSigner.address,
      );
      const aliceCoverage = await collateralAggregator.getCoverage(
        aliceSigner.address,
      );
      console.group('Collateral coverage for:');
      console.log('Bob (lender) of 1 BTC is ' + bobCoverage.toString());
      console.log('Alice (borrower) of 1 BTC is ' + aliceCoverage.toString());
      console.groupEnd();
    });

    it('Shift time by 3 month', async () => {
      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          hexBTCString,
          bobSigner.address,
        );
      console.log('totalPresentValue:', totalPresentValue);

      await time.increase(time.duration.days(92));

      const bobCoverage = await collateralAggregator.getCoverage(
        bobSigner.address,
      );
      const aliceCoverage = await collateralAggregator.getCoverage(
        aliceSigner.address,
      );
      console.group('Collateral coverage for:');
      console.log('Bob (lender) of 1 BTC is ' + bobCoverage.toString());
      console.log('Alice (borrower) of 1 BTC is ' + aliceCoverage.toString());
      console.groupEnd();

      const totalPresentValue2 =
        await lendingMarketController.getTotalPresentValue(
          hexBTCString,
          bobSigner.address,
        );
      console.log('totalPresentValue2:', totalPresentValue2);
    });

    describe('Test Liquidations for registered loans', async () => {
      it('Increase FIL exchange rate by 25%, check collateral coverage', async () => {
        const newPrice = filToETHRate.mul('125').div('100');
        await filToETHPriceFeed.updateAnswer(newPrice);

        const bobCoverage = await collateralAggregator.getCoverage(
          bobSigner.address,
        );
        const aliceCoverage = await collateralAggregator.getCoverage(
          aliceSigner.address,
        );

        console.group('Collateral coverage for:');
        console.log(
          'Bob (lender) of 1 BTC and borrower of 30 FIL is ' +
            bobCoverage.toString(),
        );
        console.log(
          'Alice (borrower) of 1 BTC and lender of 30 FIL is ' +
            aliceCoverage.toString(),
        );
        console.groupEnd();
      });
    });
  });
});
