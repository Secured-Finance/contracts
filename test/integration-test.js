const LendingMarket = artifacts.require('LendingMarket');
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');
const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);

const { hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;

const { checkTokenBalances } = require('../test-utils').balances;

const { toBN, filToETHRate } = require('../test-utils').numbers;
const { should, expect } = require('chai');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const { ONE_DAY, advanceTimeAndBlock } = require('../test-utils').time;
const { Deployment } = require('../test-utils').deployment;

should();

const ethValue = (wei) => {
  return web3.utils.toWei(web3.utils.toBN(wei), 'ether');
};

const ZERO_BN = toBN('0');

contract('Integration test', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  const targetCurrency = hexETHString;

  let collateralAggregator;
  let collateralVault;
  let lendingMarketController;

  let currencyController;
  let wETHToken;

  let filToETHPriceFeed;

  let lendingMarkets = [];
  let btcLendingMarkets = [];

  let carolOrdersSum = 0;
  let aliceIndependentAmount = ZERO_BN;
  let carolInitialCollateral = web3.utils.toBN('90000000000000000000');

  before('deploy Collateral, Loan, LendingMarket smart contracts', async () => {
    ({
      quickSortLibrary,
      addressResolver,
      collateralAggregator,
      collateralVault,
      currencyController,
      lendingMarketController,
      wETHToken,
      liquidations,
      filToETHPriceFeed,
    } = await new Deployment().execute());

    timeLibrary = await BokkyPooBahsDateTimeContract.new();
    linkToken = await LinkToken.new();
    oracleOperator = await Operator.new(linkToken.address, owner);

    await collateralVault.registerCurrency(targetCurrency, wETHToken.address);
  });

  describe('Prepare markets and users for lending deals', async () => {
    it('Deploy Lending Markets with each Term for FIL market', async () => {
      for (i = 0; i < 4; i++) {
        const receipt = await lendingMarketController
          .createLendingMarket(hexFILString)
          .then((tx) => tx.wait());

        const { marketAddr } = receipt.events.find(
          ({ event }) => event === 'LendingMarketCreated',
        ).args;

        lendingMarkets.push(marketAddr);
      }
    });

    it('Deploy Lending Markets with each Term for BTC market', async () => {
      for (i = 0; i < 4; i++) {
        const receipt = await lendingMarketController
          .createLendingMarket(hexBTCString)
          .then((tx) => tx.wait());

        const { marketAddr } = receipt.events.find(
          ({ event }) => event === 'LendingMarketCreated',
        ).args;

        btcLendingMarkets.push(marketAddr);
      }
    });

    it('Register collateral book for Carol with 90 ETH and check Carol collateral book', async () => {
      const [, , , carolSigner] = await ethers.getSigners();
      await collateralAggregator.register({ from: carol });

      let actualBalance = await wETHToken.balanceOf(collateralVault.address);
      expect(actualBalance.toString()).to.equal(ZERO_BN.toString());

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

      let currencies = await collateralVault.getUsedCurrencies(carol);
      currencies.includes(targetCurrency).should.be.equal(true);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(carol, targetCurrency);
      independentCollateral
        .toString()
        .should.be.equal(carolInitialCollateral.toString());

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          carol,
        );

      expect(totalPresentValue).to.equal('0');
    });

    it('Make lend orders by Carol', async () => {
      const _3mMarket = await LendingMarket.at(lendingMarkets[0]);
      marketOrder = await _3mMarket.order(0, ethValue(300), 920, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(300);

      const _3mBtcMarket = await LendingMarket.at(btcLendingMarkets[0]);
      marketOrder = await _3mBtcMarket.order(0, '1000000000', 300, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      const _6mMarket = await LendingMarket.at(lendingMarkets[1]);
      marketOrder = await _6mMarket.order(0, ethValue(310), 1020, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(310);

      const _6mBtcMarket = await LendingMarket.at(btcLendingMarkets[1]);
      marketOrder = await _6mBtcMarket.order(0, '1000000000', 310, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      const _9mMarket = await LendingMarket.at(lendingMarkets[2]);
      marketOrder = await _9mMarket.order(0, ethValue(320), 1120, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(320);

      const _9mBtcMarket = await LendingMarket.at(btcLendingMarkets[2]);
      marketOrder = await _9mBtcMarket.order(0, '1000000000', 320, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      const _1yMarket = await LendingMarket.at(lendingMarkets[3]);
      marketOrder = await _1yMarket.order(0, ethValue(330), 1220, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(330);

      const _1yBtcMarket = await LendingMarket.at(btcLendingMarkets[3]);
      marketOrder = await _1yBtcMarket.order(0, '1000000000', 330, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);
    });

    it('Make borrow orders by Carol', async () => {
      const _3mMarket = await LendingMarket.at(lendingMarkets[0]);
      marketOrder = await _3mMarket.order(1, ethValue(300), 680, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(300);

      const _3mBtcMarket = await LendingMarket.at(btcLendingMarkets[0]);
      marketOrder = await _3mBtcMarket.order(1, '1000000000', 270, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      const _6mMarket = await LendingMarket.at(lendingMarkets[1]);
      marketOrder = await _6mMarket.order(1, ethValue(310), 780, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(310);

      const _6mBtcMarket = await LendingMarket.at(btcLendingMarkets[1]);
      marketOrder = await _6mBtcMarket.order(1, '1000000000', 280, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      const _9mMarket = await LendingMarket.at(lendingMarkets[2]);
      marketOrder = await _9mMarket.order(1, ethValue(320), 880, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(320);

      const _9mBtcMarket = await LendingMarket.at(btcLendingMarkets[2]);
      marketOrder = await _9mBtcMarket.order(1, '1000000000', 290, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      const _1yMarket = await LendingMarket.at(lendingMarkets[3]);
      marketOrder = await _1yMarket.order(1, ethValue(330), 980, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(330);

      const _1yBtcMarket = await LendingMarket.at(btcLendingMarkets[3]);
      marketOrder = await _1yBtcMarket.order(1, '1000000000', 300, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);
    });
  });

  describe('Test Deposit and Withdraw collateral by Alice', async () => {
    it('Register collateral book without payment', async () => {
      let result = await collateralAggregator.register({ from: alice });
      expectEvent(result, 'Register');
    });

    it('Deposit 10 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));

      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));
      let depositAmt = web3.utils.toBN('10000000000000000000');

      let receipt = await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      await checkTokenBalances(
        [collateralVault.address],
        [carolInitialCollateral.add(depositAmt)],
        wETHToken,
      );

      let currencies = await collateralVault.getUsedCurrencies(alice);
      currencies.includes(targetCurrency).should.be.equal(true);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      independentCollateral.toString().should.be.equal(depositAmt.toString());

      aliceIndependentAmount = depositAmt;

      await web3.eth.getBalance(alice).then((res) => {
        res.should.be.equal(balance.sub(depositAmt).toString());
      });
    });

    it('Deposit 13.5252524 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));

      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));
      let depositAmt = web3.utils.toBN('13525252400000000000');

      let receipt = await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = aliceIndependentAmount.add(depositAmt);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());

      web3.eth.getBalance(alice).then((res) => {
        res.should.be.equal(balance.sub(depositAmt).toString());
      });
    });

    it('Try to Withdraw 30 ETH from Collateral by Alice but withdraw maximum amount of independent collateral, ', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      let withdrawal = web3.utils.toBN('30000000000000000000');
      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));

      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let receipt = await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);

      expect(independentCollateral.toString()).to.equal('0');

      // await web3.eth.getBalance(alice).then((res) => {
      //     res.should.be.equal(balance.add(aliceIndependentAmount).toString());
      // });

      aliceIndependentAmount = aliceIndependentAmount.sub(
        aliceIndependentAmount,
      );
    });

    it('Register collateral book by Bob with 1 ETH deposit', async () => {
      let result = await collateralAggregator.register({ from: bob });
      expectEvent(result, 'Register');

      const [, , bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('1000000000000000000');

      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      let currencies = await collateralVault.getUsedCurrencies(bob);
      currencies.includes(targetCurrency).should.be.equal(true);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(bob, targetCurrency);
      expect(independentCollateral.toString()).to.equal(depositAmt.toString());
    });

    it('Deposit 2 ETH by Bob in Collateral contract', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;

      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));
      web3.eth.getBalance(bob).then((res) => (balance = web3.utils.toBN(res)));

      let depositAmt = web3.utils.toBN('2000000000000000000');
      let receipt = await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      let independentCollateral =
        await collateralVault.getIndependentCollateral(bob, targetCurrency);
      expect(independentCollateral.toString()).to.equal('3000000000000000000');

      web3.eth.getBalance(bob).then((res) => {
        expect(res).to.equal(
          balance.sub(web3.utils.toBN('2000000000000000000')).toString(),
        );
      });
    });

    it('Try to withdraw 1 ETH from empty collateral book by Alice, expect no change in Alice balance', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      let withdrawal = web3.utils.toBN('1000000000000000000');

      await web3.eth
        .getGasPrice()
        .then((res) => (gasPrice = web3.utils.toBN(res)));
      await web3.eth.getBalance(alice).then((res) => {
        balance = web3.utils.toBN(res);
      });

      let receipt = await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      // web3.eth.getBalance(alice).then((res) => {
      //     res.should.be.equal(balance.sub(web3.utils.toBN("0")).toString());
      // });
    });
  });

  describe('Test making new orders on FIL LendingMarket, and check collateral usage', async () => {
    it('Deposit 1 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      let depositAmt = web3.utils.toBN('1000000000000000000');

      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));
      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let receipt = await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = aliceIndependentAmount.add(depositAmt);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Expect revert on making order for 100 FIL', async () => {
      const market = await LendingMarket.at(lendingMarkets[0]);
      expectRevert(
        market.order(0, web3.utils.toBN('100000000000000000000'), 700, {
          from: alice,
        }),
        'Not enough collateral',
      );
    });

    it('Successfully make order for 10 FIL', async () => {
      const market = await LendingMarket.at(lendingMarkets[0]);
      let marketOrder = await market.order(
        0,
        web3.utils.toBN('10000000000000000000'),
        725,
        { from: alice },
      );
      expectEvent(marketOrder, 'MakeOrder');
    });

    it('Check Alice collateral book usage, and total unsettled exposure calculations', async () => {
      let filUsed = web3.utils
        .toBN('10000000000000000000')
        .mul(web3.utils.toBN(2000))
        .div(web3.utils.toBN(10000));
      let filInETH = await currencyController.convertToETH(
        hexFILString,
        filUsed,
        { from: alice },
      );

      let exp = await collateralAggregator.getTotalUnsettledExp(alice);
      exp.toString().should.be.equal(filInETH.toString());

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Calculate collateral coverage of the global collateral book, expect to be equal with manual calculations', async () => {
      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
      let coverage = await collateralAggregator.getUnsettledCoverage(alice);

      const totalUnsettledExp = await collateralAggregator.getTotalUnsettledExp(
        alice,
      );
      let manualCoverage = web3.utils
        .toBN(independentCollateral)
        .mul(web3.utils.toBN(10000))
        .div(totalUnsettledExp);
      coverage.toNumber().should.be.equal(manualCoverage.toNumber());
    });

    it('Expect withdrawing maximum available amount instead of widthdrawing 0.9 ETH by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let withdrawal = web3.utils.toBN('900000000000000000');
      let maxWithdrawal =
        await collateralAggregator.getMaxCollateralBookWithdraw(alice);

      await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      aliceIndependentAmount = aliceIndependentAmount.sub(maxWithdrawal);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Expect withdrawing 0 instead of widthdrawing 0.1 ETH by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let maxWithdrawal =
        await collateralAggregator.getMaxCollateralBookWithdraw(alice);
      let withdrawal = web3.utils.toBN('100000000000000000');

      (
        await collateralVault
          .connect(aliceSigner)
          .withdraw(targetCurrency, withdrawal.toString())
      ).wait();

      aliceIndependentAmount = await aliceIndependentAmount.sub(maxWithdrawal);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });
  });

  describe('Test release collateral functions by canceling lending orders FIL', async () => {
    it('Successfully cancel order for 100 FIL, expect independent amount to be fully unlocked', async () => {
      let balance;
      let gasPrice;
      const market = await LendingMarket.at(lendingMarkets[0]);

      await web3.eth
        .getGasPrice()
        .then((res) => (gasPrice = web3.utils.toBN(res)));
      await web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let tx = await market.cancelOrder(3, { from: alice });
      if (tx.receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice),
        );
      }
      expectEvent(tx, 'CancelOrder');

      const totalUnsettledExp = await collateralAggregator.getTotalUnsettledExp(
        alice,
      );
      totalUnsettledExp.toString().should.be.equal('0');

      let maxWithdrawal =
        await collateralAggregator.getMaxCollateralBookWithdraw(alice);

      expect(maxWithdrawal.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );
    });

    it('Successfully widthdraw left collateral by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let maxWithdrawal =
        await collateralAggregator.getMaxCollateralBookWithdraw(alice);
      let withdrawal = web3.utils.toBN('1000000000000000000');

      aliceIndependentAmount = await aliceIndependentAmount.sub(maxWithdrawal);

      await collateralVault
        .connect(aliceSigner)
        .withdraw(targetCurrency, withdrawal.toString())
        .then((tx) => tx.wait());

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);

      expect(independentCollateral.toString()).to.equal('0');
    });
  });

  describe('Test making new orders on FIL LendingMarket by Alice, and taking orders by Bob', async () => {
    const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    let filAmount = web3.utils.toBN('30000000000000000000');
    let rate = 725;

    it('Deposit 1 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('1000000000000000000');
      let balance;
      let gasPrice;

      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));
      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let receipt = await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = aliceIndependentAmount.add(depositAmt);

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );

      web3.eth.getBalance(alice).then((res) => {
        expect(res).equal(
          balance.sub(web3.utils.toBN('1000000000000000000')).toString(),
        );
      });
    });

    it('Successfully make order for 30 FIL by Alice, take this order by Bob', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      const market = await LendingMarket.at(lendingMarkets[0]);
      let depositAmt = web3.utils.toBN('1000000000000000000');
      let marketOrder = await market.order(0, filAmount, rate, {
        from: alice,
      });
      expectEvent(marketOrder, 'MakeOrder');

      console.group('ETH address');
      console.log(`Alice: ${alice}`);
      console.log(`Bob: ${bob}`);
      console.groupEnd();

      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      let filInETH = await currencyController.convertToETH(
        hexFILString,
        filAmount,
        { from: alice },
      );
      console.log('FIL in ETH is: ' + filInETH);
      console.log('Taking order for 30 FIL, and using collateral');

      marketOrder = await market.order(1, filAmount, rate, {
        from: bob,
      });
      expectEvent(marketOrder, 'TakeOrder');

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          alice,
        );
      const totalPresentValueBob =
        await lendingMarketController.getTotalPresentValue(targetCurrency, bob);

      console.log('totalPresentValue(alice)->', totalPresentValue);
      console.log('totalPresentValue(bob)->', totalPresentValueBob);

      aliceIndependentAmount = aliceIndependentAmount.sub(
        toBN(totalPresentValue),
      );

      let independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);

      let independentCollateralBob =
        await collateralVault.getIndependentCollateral(bob, targetCurrency);

      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());

      console.log('independentCollateral(alice)->', independentCollateral);
      console.log('independentCollateral(bob)->', independentCollateralBob);

      // tx = await collateralAggregator.getCoverage(alice, bob);
      const tx1 = await collateralAggregator.getUnsettledCoverage(alice);
      const tx2 = await collateralAggregator.getUnsettledCoverage(bob);

      console.group('Collateral coverage for:');
      console.log('Bob (borrower) of 30 FIL is ' + tx1.toString());
      console.log('Alice (lender) of 30 FIL is ' + tx2.toString());
      console.groupEnd();
    });
  });

  describe('Test second loan by Alice and Bob for 1 BTC', async () => {
    let rate = 305;
    let bobRequestId;

    let btcAmount = web3.utils.toBN('1000000000000000000');

    it('Deposit 45 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      const depositAmt = web3.utils.toBN('45000000000000000000');
      let balance;
      let gasPrice;
      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));

      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let receipt = await collateralVault
        .connect(aliceSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

      const independentCollateral =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);

      expect(independentCollateral.toString()).to.equal(
        aliceIndependentAmount.toString(),
      );

      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          alice,
        );
      expect(totalPresentValue).to.equal('0');

      web3.eth.getBalance(alice).then((res) => {
        expect(res).to.equal(balance.sub(depositAmt).toString());
      });
    });

    it('Successfully make order for 1 BTC by Bob, deposit 15 ETH by Bob, take this order by Alice', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('15000000000000000000');
      const market = await LendingMarket.at(btcLendingMarkets[0]);

      await collateralVault
        .connect(bobSigner)
        .deposit(targetCurrency, depositAmt.toString(), {
          value: depositAmt.toString(),
        })
        .then((tx) => tx.wait());

      console.log('Making a new order to lend 1 BTC for 5 years by Bob');

      let marketOrder = await market.order(0, btcAmount, rate, {
        from: bob,
      });
      expectEvent(marketOrder, 'MakeOrder');

      console.log(
        'Taking order for 1 BTC, and using collateral by Alice as a borrower',
      );

      marketOrder = await market.order(1, btcAmount, rate, {
        from: alice,
      });
      expectEvent(marketOrder, 'TakeOrder');

      let btcInETH = await currencyController.convertToETH(
        hexBTCString,
        btcAmount,
        { from: alice },
      );

      // let lockedCollaterals = await collateralVault[
      //   'getLockedCollateral(address,address,bytes32)'
      // ](alice, bob, targetCurrency);
      const totalPresentValue =
        await lendingMarketController.getTotalPresentValue(
          targetCurrency,
          alice,
        );
      // aliceLockedCollateral = lockedCollaterals[0];

      aliceIndependentAmount = await aliceIndependentAmount.sub(
        toBN(totalPresentValue),
      );

      console.log('BTC in ETH is: ' + btcInETH);

      // tx = await collateralAggregator.getCoverage(alice, bob);
      const tx1 = await collateralAggregator.getUnsettledCoverage(alice);
      const tx2 = await collateralAggregator.getUnsettledCoverage(bob);
      console.group('Collateral coverage for:');
      console.log('Bob (lender) of 1 BTC is ' + tx2.toString());
      console.log('Alice (borrower) of 1 BTC is ' + tx1.toString());
      console.groupEnd();
    });

    it('Shift time by 6 month, perform mark-to-market and present value updates', async () => {
      let midBTCRates = await lendingMarketController.getMidRates(hexBTCString);
      console.log(midBTCRates[3].toString());

      let lendBTCRates = await lendingMarketController.getLendRates(
        hexBTCString,
      );
      console.log(lendBTCRates[3].toString());

      let borrowBTCRates = await lendingMarketController.getBorrowRates(
        hexBTCString,
      );
      console.log(borrowBTCRates[3].toString());
      console.log(
        'Shift time by 6 month, perform mark-to-market for BTC lending deal',
      );

      await advanceTimeAndBlock(180 * ONE_DAY);

      // tx = await collateralAggregator.getCoverage(alice, bob);
      const tx1 = await collateralAggregator.getUnsettledCoverage(alice);
      const tx2 = await collateralAggregator.getUnsettledCoverage(bob);

      console.group('Collateral coverage for:');
      console.log('Bob (lender) of 1 BTC is ' + tx2.toString());
      console.log('Alice (borrower) of 1 BTC is ' + tx1.toString());
      console.groupEnd();

      // const ccyExp = await collateralAggregator.getCcyExposures(
      //   alice,
      //   bob,
      //   hexBTCString,
      // );
      // ccyExp[0].toString().should.be.equal('0');
      // ccyExp[1].toString().should.be.equal('0');
      // ccyExp[2].toString().should.be.equal(pv.toString());
      // ccyExp[3].toString().should.be.equal('0');

      // let rebalance = await collateralAggregator.getRebalanceCollateralAmounts(alice, bob);
      // rebalance[1].toString().should.be.equal('0');
      // rebalance[0].toString().should.be.equal('0');
    });

    describe('Test Liquidations for registered loans', async () => {
      it('Increase FIL exchange rate by 25%, check collateral coverage', async () => {
        const newPrice = filToETHRate
          .mul(web3.utils.toBN('125'))
          .div(web3.utils.toBN('100'));
        await filToETHPriceFeed.updateAnswer(newPrice);

        // let coverage = await collateralAggregator.getCoverage(alice, bob);
        const tx1 = await collateralAggregator.getUnsettledCoverage(alice);
        const tx2 = await collateralAggregator.getUnsettledCoverage(bob);

        console.group('Collateral coverage for:');
        console.log(
          'Alice (borrower) of 1 BTC and lender of 30 FIL is ' + tx1.toString(),
        );
        console.log(
          'Bob (lender) of 1 BTC and borrower of 30 FIL is ' + tx2.toString(),
        );
        console.groupEnd();
      });
    });
  });
});
