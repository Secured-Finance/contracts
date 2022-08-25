const LendingMarket = artifacts.require('LendingMarket');
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');

const { hexFILString, hexBTCString, hexETHString } =
  require('../test-utils').strings;

const { checkTokenBalances } = require('../test-utils').balances;

const { toBN, filToETHRate } = require('../test-utils').numbers;
const { should, expect } = require('chai');
const { expectEvent, time } = require('@openzeppelin/test-helpers');

const { Deployment } = require('../test-utils').deployment;

should();

const toWei = (eth) => {
  return ethers.utils.parseEther(eth);
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

  let aliceIndependentAmount = ZERO_BN;
  let carolInitialCollateral = web3.utils.toBN('90000000000000000000');

  before('Deploy Contracts', async () => {
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

    linkToken = await LinkToken.new();
    oracleOperator = await Operator.new(linkToken.address, owner);

    await collateralVault.registerCurrency(targetCurrency, wETHToken.address);

    // Deploy Lending Markets for FIL market
    for (i = 0; i < 4; i++) {
      const receipt = await lendingMarketController
        .createLendingMarket(hexFILString)
        .then((tx) => tx.wait());

      const { marketAddr } = receipt.events.find(
        ({ event }) => event === 'LendingMarketCreated',
      ).args;
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
    for (i = 0; i < 4; i++) {
      const receipt = await lendingMarketController
        .createLendingMarket(hexBTCString)
        .then((tx) => tx.wait());

      const { marketAddr } = receipt.events.find(
        ({ event }) => event === 'LendingMarketCreated',
      ).args;

      // btcLendingMarkets.push(marketAddr);
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
      const [, , , carolSigner] = await ethers.getSigners();

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
          .createOrder(hexBTCString, _9mBtcMaturity, '0', '1000000000', '320', {
            from: carol,
          }),
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
      const [, , , carolSigner] = await ethers.getSigners();

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
          .createOrder(hexBTCString, _1yBtcMaturity, '1', '1000000000', '300', {
            from: carol,
          }),
      ).to.emit(btcLendingMarkets[3], 'MakeOrder');
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
      const [, aliceSigner] = await ethers.getSigners();
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
      const [, aliceSigner] = await ethers.getSigners();
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
      const [, aliceSigner] = await ethers.getSigners();

      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
      );

      await web3.eth
        .getGasPrice()
        .then((res) => (gasPrice = web3.utils.toBN(res)));
      await web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let tx = await lendingMarketController
        .connect(aliceSigner)
        .cancelOrder(hexFILString, maturities[0], '3');

      await expect(tx).to.emit(lendingMarkets[0], 'CancelOrder');

      const receipt = await tx.wait();
      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

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

      aliceIndependentAmount = aliceIndependentAmount.sub(maxWithdrawal);

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
    let filAmount = '30000000000000000000';
    let rate = '725';

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
      const [, aliceSigner, bobSigner] = await ethers.getSigners();
      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
      );

      let depositAmt = web3.utils.toBN('1000000000000000000');
      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(hexFILString, maturities[0], '0', filAmount, rate),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

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

      await expect(
        lendingMarketController
          .connect(bobSigner)
          .createOrder(hexFILString, maturities[0], '1', filAmount, rate),
      ).to.emit(lendingMarkets[0], 'TakeOrder');

      let independentCollateralAlice =
        await collateralVault.getIndependentCollateral(alice, targetCurrency);
      let independentCollateralBob =
        await collateralVault.getIndependentCollateral(bob, targetCurrency);

      let maxWithdrawalAlice =
        await collateralAggregator.getMaxCollateralBookWithdraw(alice);
      let maxWithdrawalBob =
        await collateralAggregator.getMaxCollateralBookWithdraw(bob);

      const totalPresentValueBob =
        await lendingMarketController.getTotalPresentValueInETH(bob);

      expect(maxWithdrawalAlice.toString()).to.equal(
        independentCollateralAlice.toString(),
      );
      expect(maxWithdrawalBob.toString()).to.equal(
        independentCollateralBob.add(totalPresentValueBob).toString(),
      );

      const tx1 = await collateralAggregator.getUnsettledCoverage(alice);
      const tx2 = await collateralAggregator.getUnsettledCoverage(bob);

      console.group('Collateral coverage for:');
      console.log('Bob (borrower) of 30 FIL is ' + tx1.toString());
      console.log('Alice (lender) of 30 FIL is ' + tx2.toString());
      console.groupEnd();
    });
  });

  describe('Test second loan by Alice and Bob for 1 BTC', async () => {
    let rate = '305';

    let btcAmount = '1000000000000000000';

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
      const [, aliceSigner, bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('15000000000000000000');
      const maturities = await lendingMarketController.getMaturities(
        hexFILString,
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
          .createOrder(hexFILString, maturities[0], '0', btcAmount, rate),
      ).to.emit(lendingMarkets[0], 'MakeOrder');

      console.log(
        'Taking order for 1 BTC, and using collateral by Alice as a borrower',
      );

      await expect(
        lendingMarketController
          .connect(aliceSigner)
          .createOrder(hexFILString, maturities[0], '1', btcAmount, rate),
      ).to.emit(lendingMarkets[0], 'TakeOrder');

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
      // let midBTCRates = await lendingMarketController.getMidRates(hexBTCString);
      // console.log(midBTCRates.map((rate) => rate.toString()));

      // let lendBTCRates = await lendingMarketController.getLendRates(
      //   hexBTCString,
      // );
      // console.log(lendBTCRates.map((rate) => rate.toString()));

      // let borrowBTCRates = await lendingMarketController.getBorrowRates(
      //   hexBTCString,
      // );
      // console.log(borrowBTCRates.map((rate) => rate.toString()));
      console.log(
        'Shift time by 6 month, perform mark-to-market for BTC lending deal',
      );

      await time.increase(time.duration.days(180));

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
