const LendingMarket = artifacts.require('LendingMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');
const ChainlinkSettlementAdapterMock = artifacts.require(
  'ChainlinkSettlementAdapterMock',
);
const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);

const {
  hexFILString,
  hexBTCString,
  hexETHString,
  loanPrefix,
  zeroAddress,
  testJobId,
  secondJobId,
  testTxHash,
  secondTxHash,
  aliceFILAddress,
  aliceBTCAddress,
  bobFILAddress,
  bobBTCAddress,
} = require('../test-utils').strings;
const { computeCrosschainSettlementId } = require('../test-utils').settlementId;

const {
  sortedTermDays,
  sortedTermsDfFracs,
  sortedTermsNumPayments,
  sortedTermsSchedules,
} = require('../test-utils').terms;
const { checkTokenBalances } = require('../test-utils').balances;

const { toBN, IR_BASE, oracleRequestFee } = require('../test-utils').numbers;
const { should } = require('chai');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const utils = require('web3-utils');

const { hashPosition } = require('../test-utils/src/timeSlot');
const { ONE_DAY, advanceTimeAndBlock, getLatestTimestamp } =
  require('../test-utils').time;
const { Deployment } = require('../test-utils').deployment;

should();

const ethValue = (wei) => {
  return web3.utils.toWei(web3.utils.toBN(wei), 'ether');
};

const ZERO_BN = toBN('0');
const BP_BASE = toBN('10000');
const SETTLEMENT_LOCK = toBN('2000');

contract('Integration test', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let addressResolver;
  let collateralAggregator;
  let loan;
  let lendingMarketController;
  let lendingMarket;
  let btcLendingMarket;
  let termStructure;
  let timeLibrary;
  let currencyController;
  let settlementEngine;
  let wETHToken;

  let filToETHRate = web3.utils.toBN('67175250000000000');
  let ethToUSDRate = web3.utils.toBN('232612637168');
  let btcToETHRate = web3.utils.toBN('23889912590000000000');

  let filToETHPriceFeed;
  let btcToETHPriceFeed;

  let lendingMarkets = [];
  let btcLendingMarkets = [];

  let carolOrdersSum = 0;

  let aliceIndependentAmount = ZERO_BN;
  let aliceLockedCollateral = ZERO_BN;

  let carolInitialCollateral = web3.utils.toBN('90000000000000000000');

  let prefix = '0x21aaa47b';
  const words = 64;

  const generateId = (value) => {
    let right = utils.toBN(utils.rightPad(prefix, words));
    let left = utils.toBN(utils.leftPad(value, words));

    let id = utils.numberToHex(right.or(left));

    return id;
  };

  before('deploy Collateral, Loan, LendingMarket smart contracts', async () => {
    ({
      quickSortLibrary,
      discountFactorLibrary,
      addressResolver,
      productAddressResolver,
      paymentAggregator,
      collateralAggregator,
      currencyController,
      termStructure,
      lendingMarketController,
      loan,
      wETHToken,
      settlementEngine,
      liquidations,
    } = await new Deployment().execute());

    timeLibrary = await BokkyPooBahsDateTimeContract.new();

    filToETHPriceFeed = await MockV3Aggregator.new(
      18,
      hexFILString,
      filToETHRate,
    );
    ethToUSDPriceFeed = await MockV3Aggregator.new(
      8,
      hexETHString,
      ethToUSDRate,
    );
    btcToETHPriceFeed = await MockV3Aggregator.new(
      18,
      hexBTCString,
      btcToETHRate,
    );

    let tx = await currencyController.supportCurrency(
      hexETHString,
      'Ethereum',
      60,
      ethToUSDPriceFeed.address,
      7500,
      zeroAddress,
    );
    expectEvent(tx, 'CcyAdded');

    tx = await currencyController.supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    );
    expectEvent(tx, 'CcyAdded');

    tx = await currencyController.supportCurrency(
      hexBTCString,
      'Bitcoin',
      0,
      btcToETHPriceFeed.address,
      7500,
      zeroAddress,
    );
    expectEvent(tx, 'CcyAdded');

    tx = await currencyController.updateCollateralSupport(hexETHString, true);
    expectEvent(tx, 'CcyCollateralUpdate');

    tx = await currencyController.updateMinMargin(hexETHString, 2500);
    expectEvent(tx, 'MinMarginUpdated');

    linkToken = await LinkToken.new();
    oracleOperator = await Operator.new(linkToken.address, owner);
    settlementAdapter = await ChainlinkSettlementAdapterMock.new(
      oracleOperator.address,
      testJobId,
      oracleRequestFee,
      linkToken.address,
      hexFILString,
      settlementEngine.address,
    );

    btcSettlementAdapter = await ChainlinkSettlementAdapterMock.new(
      oracleOperator.address,
      secondJobId,
      oracleRequestFee,
      linkToken.address,
      hexBTCString,
      settlementEngine.address,
    );

    await settlementEngine.addExternalAdapter(
      settlementAdapter.address,
      hexFILString,
    );

    await settlementEngine.addExternalAdapter(
      btcSettlementAdapter.address,
      hexBTCString,
    );

    await linkToken.transfer(
      settlementAdapter.address,
      toBN('100000000000000000000'),
    );

    await linkToken.transfer(
      btcSettlementAdapter.address,
      toBN('100000000000000000000'),
    );

    const collateralVaultFactory = await ethers.getContractFactory(
      'CollateralVault',
    );
    ethVault = await collateralVaultFactory.deploy(
      addressResolver.address,
      hexETHString,
      wETHToken.address,
      wETHToken.address,
    );
    await collateralAggregator.linkCollateralVault(ethVault.address);
    console.log('ethVault is ' + ethVault.address);

    await productAddressResolver.registerProduct(
      loanPrefix,
      loan.address,
      lendingMarketController.address,
      { from: owner },
    );

    let contract = await productAddressResolver.getProductContract(loanPrefix);
    contract.should.be.equal(loan.address);

    contract = await productAddressResolver.getControllerContract(loanPrefix);
    contract.should.be.equal(lendingMarketController.address);

    for (i = 0; i < sortedTermDays.length; i++) {
      await termStructure.supportTerm(
        sortedTermDays[i],
        [loanPrefix],
        [hexFILString, hexBTCString, hexETHString],
      );

      let term = await termStructure.getTerm(sortedTermDays[i], 0);
      term[0].toString().should.be.equal(sortedTermDays[i].toString());
      term[1].toString().should.be.equal(sortedTermsDfFracs[i].toString());
      term[2].toString().should.be.equal(sortedTermsNumPayments[i].toString());

      let paymentSchedule = await termStructure.getTermSchedule(
        sortedTermDays[i],
        0,
      );
      paymentSchedule.map((days, j) => {
        days.toString().should.be.equal(sortedTermsSchedules[i][j]);
      });
    }
  });

  describe('Prepare markets and users for lending deals', async () => {
    it('Deploy Lending Markets with each Term for FIL market', async () => {
      for (i = 0; i < sortedTermDays.length; i++) {
        const tx = await lendingMarketController.deployLendingMarket(
          hexFILString,
          sortedTermDays[i],
        );
        const receipt = await tx.wait();
        const { marketAddr } = receipt.events.find(
          ({ event }) => event === 'LendingMarketCreated',
        ).args;

        lendingMarkets.push(marketAddr);
        let lendingMarket = await LendingMarket.at(marketAddr);

        await collateralAggregator.linkLendingMarket(lendingMarket.address, {
          from: owner,
        });
        await loan.addLendingMarket(
          hexFILString,
          sortedTermDays[i],
          lendingMarket.address,
        );
      }

      lendingMarket = await LendingMarket.at(lendingMarkets[2]);
    });

    it('Deploy Lending Markets with each Term for BTC market', async () => {
      for (i = 0; i < sortedTermDays.length; i++) {
        const tx = await lendingMarketController.deployLendingMarket(
          hexBTCString,
          sortedTermDays[i],
        );
        const receipt = await tx.wait();
        const { marketAddr } = receipt.events.find(
          ({ event }) => event === 'LendingMarketCreated',
        ).args;

        btcLendingMarkets.push(marketAddr);
        let btcLendingMarket = await LendingMarket.at(marketAddr);

        await collateralAggregator.linkLendingMarket(btcLendingMarket.address, {
          from: owner,
        });
        await loan.addLendingMarket(
          hexBTCString,
          sortedTermDays[i],
          btcLendingMarket.address,
          { from: owner },
        );
      }

      btcLendingMarket = await LendingMarket.at(btcLendingMarkets[5]);
    });

    it('Register collateral book for Carol with 90 ETH and check Carol collateral book', async () => {
      const [, , , carolSigner] = await ethers.getSigners();
      await collateralAggregator.register({ from: carol });

      await checkTokenBalances([ethVault.address], [ZERO_BN], wETHToken);

      await (
        await ethVault
          .connect(carolSigner)
          ['deposit(uint256)'](carolInitialCollateral.toString(), {
            value: carolInitialCollateral.toString(),
          })
      ).wait();

      await checkTokenBalances(
        [ethVault.address],
        [carolInitialCollateral],
        wETHToken,
      );

      let vaults = await collateralAggregator.getUsedVaults(carol);
      vaults.includes(ethVault.address).should.be.equal(true);

      let independentCollateral = await ethVault.getIndependentCollateral(
        carol,
      );
      independentCollateral
        .toString()
        .should.be.equal(carolInitialCollateral.toString());

      let lockedCollateral = await ethVault['getLockedCollateral(address)'](
        carol,
      );
      lockedCollateral.toString().should.be.equal('0');
    });

    it('Make lend orders by Carol', async () => {
      let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
      marketOrder = await _3mMarket.order(0, ethValue(300), 920, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(300);

      _3mMarket = await LendingMarket.at(btcLendingMarkets[0]);
      marketOrder = await _3mMarket.order(0, '1000000000', 300, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
      marketOrder = await _6mMarket.order(0, ethValue(310), 1020, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(310);

      _6mMarket = await LendingMarket.at(btcLendingMarkets[1]);
      marketOrder = await _6mMarket.order(0, '1000000000', 310, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
      marketOrder = await _1yMarket.order(0, ethValue(320), 1120, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(320);

      _1yMarket = await LendingMarket.at(btcLendingMarkets[2]);
      marketOrder = await _1yMarket.order(0, '1000000000', 320, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
      marketOrder = await _2yMarket.order(0, ethValue(330), 1220, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(330);

      _2yMarket = await LendingMarket.at(btcLendingMarkets[3]);
      marketOrder = await _2yMarket.order(0, '1000000000', 330, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
      marketOrder = await _3yMarket.order(0, ethValue(340), 1320, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(340);

      _3yMarket = await LendingMarket.at(btcLendingMarkets[4]);
      marketOrder = await _3yMarket.order(0, '1000000000', 340, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
      marketOrder = await _5yMarket.order(0, ethValue(350), 1520, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(350);

      _5yMarket = await LendingMarket.at(btcLendingMarkets[5]);
      marketOrder = await _5yMarket.order(0, '1000000000', 350, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);
    });

    it('Make borrow orders by Carol', async () => {
      let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
      marketOrder = await _3mMarket.order(1, ethValue(300), 680, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(300);

      _3mMarket = await LendingMarket.at(btcLendingMarkets[0]);
      marketOrder = await _3mMarket.order(1, '1000000000', 270, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
      marketOrder = await _6mMarket.order(1, ethValue(310), 780, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(310);

      _6mMarket = await LendingMarket.at(btcLendingMarkets[1]);
      marketOrder = await _6mMarket.order(1, '1000000000', 280, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
      marketOrder = await _1yMarket.order(1, ethValue(320), 880, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(320);

      _1yMarket = await LendingMarket.at(btcLendingMarkets[2]);
      marketOrder = await _1yMarket.order(1, '1000000000', 290, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
      marketOrder = await _2yMarket.order(1, ethValue(330), 980, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(330);

      _2yMarket = await LendingMarket.at(btcLendingMarkets[3]);
      marketOrder = await _2yMarket.order(1, '1000000000', 300, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
      marketOrder = await _3yMarket.order(1, ethValue(340), 1080, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(340);

      _3yMarket = await LendingMarket.at(btcLendingMarkets[4]);
      marketOrder = await _3yMarket.order(1, '1000000000', 310, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
      marketOrder = await _5yMarket.order(1, ethValue(350), 1280, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(350);

      _5yMarket = await LendingMarket.at(btcLendingMarkets[5]);
      marketOrder = await _5yMarket.order(1, '1000000000', 320, {
        from: carol,
      });
      expectEvent(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);
    });
  });

  describe('Test Deposit and Withraw collateral by Alice', async () => {
    it('Register collateral book without payment', async () => {
      let result = await collateralAggregator.methods[
        'register(string[],uint256[])'
      ]([aliceBTCAddress, aliceFILAddress], [0, 461], { from: alice });

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

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();
      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      await checkTokenBalances(
        [ethVault.address],
        [carolInitialCollateral.add(depositAmt)],
        wETHToken,
      );

      let vaults = await collateralAggregator.getUsedVaults(alice);
      vaults.includes(ethVault.address).should.be.equal(true);

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral.toString().should.be.equal(depositAmt.toString());

      aliceIndependentAmount = await depositAmt;

      web3.eth.getBalance(alice).then((res) => {
        res.should.be.equal(balance.sub(aliceIndependentAmount).toString());
      });
    });

    it('Deposit 13,5252524 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));

      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));
      let depositAmt = web3.utils.toBN('13525252400000000000');

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
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

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['withdraw(uint256)'](withdrawal.toString())
      ).wait();
      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral.toString().should.be.equal('0');

      // await web3.eth.getBalance(alice).then((res) => {
      //     res.should.be.equal(balance.add(aliceIndependentAmount).toString());
      // });

      aliceIndependentAmount = await aliceIndependentAmount.sub(
        aliceIndependentAmount,
      );
    });

    it('Register collateral book by Bob with 1 ETH deposit', async () => {
      let result = await collateralAggregator.methods[
        'register(string[],uint256[])'
      ]([bobBTCAddress, bobFILAddress], [0, 461], { from: bob });

      expectEvent(result, 'Register');

      const [, , bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('1000000000000000000');

      await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      let vaults = await collateralAggregator.getUsedVaults(bob);
      vaults.includes(ethVault.address).should.be.equal(true);

      let independentCollateral = await ethVault.getIndependentCollateral(bob);
      independentCollateral.toString().should.be.equal(depositAmt.toString());
    });

    it('Deposit 2 ETH by Bob in Collateral contract', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      let balance;
      let gasPrice;
      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));

      web3.eth.getBalance(bob).then((res) => (balance = web3.utils.toBN(res)));

      let depositAmt = web3.utils.toBN('2000000000000000000');
      let receipt = await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      let independentCollateral = await ethVault.getIndependentCollateral(bob);
      independentCollateral.toString().should.be.equal('3000000000000000000');

      web3.eth.getBalance(bob).then((res) => {
        res.should.be.equal(
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

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['withdraw(uint256)'](withdrawal.toString())
      ).wait();
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

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
    });

    it('Expect revert on making order for 100 FIL', async () => {
      expectRevert(
        lendingMarket.order(0, web3.utils.toBN('100000000000000000000'), 700, {
          from: alice,
        }),
        'Not enough collateral',
      );
    });

    it('Successfully make order for 10 FIL', async () => {
      let marketOrder = await lendingMarket.order(
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

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
    });

    it('Calculate collateral coverage of the global collateral book, expect to be equal with manual calculations', async () => {
      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
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
      let maxWidthdrawal =
        await collateralAggregator.getMaxCollateralBookWidthdraw(alice);

      (
        await ethVault
          .connect(aliceSigner)
          ['withdraw(uint256)'](withdrawal.toString())
      ).wait();

      aliceIndependentAmount = await aliceIndependentAmount.sub(maxWidthdrawal);

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
    });

    it('Expect withdrawing 0 instead of widthdrawing 0.1 ETH by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let maxWidthdrawal =
        await collateralAggregator.getMaxCollateralBookWidthdraw(alice);
      let withdrawal = web3.utils.toBN('100000000000000000');

      (
        await ethVault
          .connect(aliceSigner)
          ['withdraw(uint256)'](withdrawal.toString())
      ).wait();

      aliceIndependentAmount = await aliceIndependentAmount.sub(maxWidthdrawal);

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
    });
  });

  describe('Test release collateral functions by canceling lending orders FIL', async () => {
    it('Successfully cancel order for 100 FIL, expect independent amount to be fully unlocked', async () => {
      let balance;
      let gasPrice;
      await web3.eth
        .getGasPrice()
        .then((res) => (gasPrice = web3.utils.toBN(res)));
      await web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let tx = await lendingMarket.cancelOrder(3, { from: alice });
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

      let maxWidthdrawal =
        await collateralAggregator.getMaxCollateralBookWidthdraw(alice);
      maxWidthdrawal
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
    });

    it('Successfully widthdraw left collateral by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let maxWidthdrawal =
        await collateralAggregator.getMaxCollateralBookWidthdraw(alice);
      let withdrawal = web3.utils.toBN('1000000000000000000');

      aliceIndependentAmount = await aliceIndependentAmount.sub(maxWidthdrawal);

      (
        await ethVault
          .connect(aliceSigner)
          ['withdraw(uint256)'](withdrawal.toString())
      ).wait();

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral.toString().should.be.equal('0');
    });
  });

  describe('Test making new orders on FIL LendingMarket by Alice, and taking orders by Bob', async () => {
    const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    let loanId = generateId(1); // first loan in loan contract
    let filAmount = web3.utils.toBN('30000000000000000000');
    let _1yearDealStart0;
    let slotTime;
    let slotDate;
    let _1yearTimeSlot;
    let rate = 725;
    let coupon;
    let totalPayment;
    let aliceRequestId;

    it('Deposit 1 ETH by Alice in Collateral contract', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('1000000000000000000');
      let balance;
      let gasPrice;

      web3.eth.getGasPrice().then((res) => (gasPrice = web3.utils.toBN(res)));
      web3.eth
        .getBalance(alice)
        .then((res) => (balance = web3.utils.toBN(res)));

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());

      web3.eth.getBalance(alice).then((res) => {
        res.should.be.equal(
          balance.sub(web3.utils.toBN('1000000000000000000')).toString(),
        );
      });
    });

    it('Successfully make order for 30 FIL by Alice, take this order by Bob', async () => {
      const [, aliceSigner, bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('1000000000000000000');
      let marketOrder = await lendingMarket.order(0, filAmount, rate, {
        from: alice,
      });
      expectEvent(marketOrder, 'MakeOrder');

      console.group('ETH address');
      console.log(`Alice: ${alice}`);
      console.log(`Bob: ${bob}`);
      console.groupEnd();

      await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      let filInETH = await currencyController.convertToETH(
        hexFILString,
        filAmount,
        { from: alice },
      );
      console.log('FIL in ETH is: ' + filInETH);
      console.log('Taking order for 30 FIL, and using collateral');

      marketOrder = await lendingMarket.order(1, filAmount, rate, {
        from: bob,
      });
      expectEvent(marketOrder, 'TakeOrder');

      let lockedCollaterals = await ethVault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      aliceLockedCollateral = lockedCollaterals[0];

      aliceIndependentAmount = await aliceIndependentAmount.sub(
        toBN(aliceLockedCollateral),
      );

      let independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );

      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());

      let rebalance = await collateralAggregator.getRebalanceCollateralAmounts(
        alice,
        bob,
      );
      rebalance[1].toString().should.be.equal('0');
      rebalance[0].toString().should.be.equal('0');

      console.log(
        'Calculating collateral coverage after registering loan deal for 30 FIL',
      );

      tx = await collateralAggregator.getCoverage(alice, bob);

      console.group('Collateral coverage for:');
      console.log('Bob (borrower) of 30 FIL is ' + tx[0].toString());
      console.log('Alice (lender) of 30 FIL is ' + tx[1].toString());
      console.groupEnd();
    });

    it('Check cashflow structure of the loan deal between Alice and Bob', async () => {
      now = await getLatestTimestamp();
      _1yearDealStart0 = now;
      slotTime = await timeLibrary.addDays(now, 365);
      slotDate = await timeLibrary.timestampToDate(slotTime);
      _1yearTimeSlot = await hashPosition(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      coupon = filAmount.mul(toBN(rate)).div(IR_BASE);
      totalPayment = filAmount.add(coupon);

      const deal = await loan.getLoanDeal(loanId);
      deal.lender.should.be.equal(alice);
      deal.borrower.should.be.equal(bob);
      deal.ccy.should.be.equal(hexFILString);
      deal.term.toString().should.be.equal('365');
      deal.notional.toString().should.be.equal(filAmount.toString());
      deal.rate.toString().should.be.equal(rate.toString());

      const timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _1yearTimeSlot,
      );
      timeSlot[0].toString().should.be.equal('0');
      timeSlot[1].toString().should.be.equal(totalPayment.toString());
      timeSlot[2].toString().should.be.equal(totalPayment.toString());
      timeSlot[3].toString().should.be.equal('0');
      timeSlot[4].should.be.equal(true);
      timeSlot[5].should.be.equal(false);
    });

    it('Try to verify notional payment from lender for 30 FIL deal', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      const pv = await loan.getDealPV(loanId);
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob before notional payment settlement: ' +
          pv,
      );

      now = await getLatestTimestamp();
      slotTime = await timeLibrary.addDays(now, 2);

      const requestId = await (
        await settlementEngine
          .connect(aliceSigner)
          .verifyPayment(
            bob,
            hexFILString,
            filAmount.toString(),
            slotTime.toString(),
            testTxHash,
          )
      ).wait();

      aliceRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;
    });

    it('Validate settlement request by chainlink external adapter and check present value', async () => {
      slotDate = await timeLibrary.timestampToDate(slotTime);
      _2daysTimeSlot = await hashPosition(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      await settlementAdapter.fulfill(
        aliceRequestId,
        aliceFILAddress,
        bobFILAddress,
        filAmount.toString(),
        slotTime.toString(),
        testTxHash,
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        alice,
        bob,
        hexFILString,
        _2daysTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(filAmount.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(filAmount.toString());
      timeSlot[3].toString().should.be.equal(filAmount.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);

      const settlementId = computeCrosschainSettlementId(testTxHash);

      let confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          bob,
          alice,
          hexFILString,
          _2daysTimeSlot,
          settlementId,
        );
      confirmation[0].should.be.equal(alice);
      confirmation[1].toString().should.be.equal(filAmount.toString());

      aliceIndependentAmount = await aliceIndependentAmount.add(
        toBN(aliceLockedCollateral),
      );

      const independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );

      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());

      const pv = await loan.getDealPV(loanId);

      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after notional exchange: ' +
          pv.toString(),
      );
    });

    it('Shift time by 3 month, perform mark-to-market and present value updates', async () => {
      await advanceTimeAndBlock(90 * ONE_DAY);
      await loan.functions['markToMarket(bytes32)'](loanId);

      const pv = await loan.getDealPV(loanId);

      console.log('Performing second mark-to-market after 3 month');
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after first payment settlement: ' +
          pv,
      );

      const ccyExp = await collateralAggregator.getCcyExposures(
        alice,
        bob,
        hexFILString,
      );
      ccyExp[0].toString().should.be.equal('0');
      ccyExp[1].toString().should.be.equal('0');
      ccyExp[2].toString().should.be.equal('0');
      ccyExp[3].toString().should.be.equal(pv.toString());
    });
  });

  describe('Test second loan by Alice and Bob for 1 BTC', async () => {
    const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    loanId = generateId(2);
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

      let receipt = await (
        await ethVault
          .connect(aliceSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      if (receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(receipt.gasUsed).mul(gasPrice),
        );
      }

      aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

      const independentCollateral = await ethVault.getIndependentCollateral(
        alice,
      );
      independentCollateral
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());

      const lockedCollateral = await ethVault['getLockedCollateral(address)'](
        alice,
      );
      lockedCollateral.toString().should.be.equal('0');

      web3.eth.getBalance(alice).then((res) => {
        res.should.be.equal(balance.sub(depositAmt).toString());
      });
    });

    it('Successfully make order for 1 BTC by Bob, deposit 15 ETH by Bob, take this order by Alice', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('15000000000000000000');

      await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      console.log('Making a new order to lend 1 BTC for 5 years by Bob');

      let marketOrder = await btcLendingMarket.order(0, btcAmount, rate, {
        from: bob,
      });
      expectEvent(marketOrder, 'MakeOrder');

      console.log(
        'Taking order for 1 BTC, and using collateral by Alice as a borrower',
      );

      marketOrder = await btcLendingMarket.order(1, btcAmount, rate, {
        from: alice,
      });
      expectEvent(marketOrder, 'TakeOrder');

      let btcUsed = btcAmount
        .mul(web3.utils.toBN(15000))
        .div(web3.utils.toBN(10000));
      let btcInETH = await currencyController.convertToETH(
        hexBTCString,
        btcAmount,
        { from: alice },
      );

      let lockedCollaterals = await ethVault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      aliceLockedCollateral = lockedCollaterals[0];

      aliceIndependentAmount = await aliceIndependentAmount.sub(
        toBN(aliceLockedCollateral),
      );

      console.log('BTC in ETH is: ' + btcInETH);

      let rebalance = await collateralAggregator.getRebalanceCollateralAmounts(
        alice,
        bob,
      );
      rebalance[1].toString().should.be.equal('0');
      rebalance[0].toString().should.be.equal('0');

      console.log(
        'Calculating collateral coverage after registering loan deal for 30 FIL',
      );

      tx = await collateralAggregator.getCoverage(alice, bob);
      console.group('Collateral coverage for:');
      console.log('Bob (lender) of 1 BTC is ' + tx[1].toString());
      console.log('Alice (borrower) of 1 BTC is ' + tx[0].toString());
      console.groupEnd();
    });

    it('Check cashflow structure of the second loan deal between Alice and Bob', async () => {
      now = await getLatestTimestamp();
      _1yearDealStart0 = now;
      slotTime = await timeLibrary.addDays(now, 365);
      slotDate = await timeLibrary.timestampToDate(slotTime);
      _1yearTimeSlot = await hashPosition(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      slotTime = await timeLibrary.addDays(now, 1825);
      slotDate = await timeLibrary.timestampToDate(slotTime);
      _5yearTimeSlot = await hashPosition(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      coupon = btcAmount.mul(toBN(rate)).div(IR_BASE);
      totalPayment = btcAmount.add(coupon);

      const deal = await loan.getLoanDeal(loanId);
      deal.lender.should.be.equal(bob);
      deal.borrower.should.be.equal(alice);
      deal.ccy.should.be.equal(hexBTCString);
      deal.term.toString().should.be.equal('1825');
      deal.notional.toString().should.be.equal(btcAmount.toString());
      deal.rate.toString().should.be.equal(rate.toString());

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexBTCString,
        _1yearTimeSlot,
      );
      timeSlot[0].toString().should.be.equal('0');
      timeSlot[1].toString().should.be.equal(coupon.toString());
      timeSlot[2].toString().should.be.equal(coupon.toString());
      timeSlot[3].toString().should.be.equal('0');
      timeSlot[4].should.be.equal(true);
      timeSlot[5].should.be.equal(false);

      timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexBTCString,
        _5yearTimeSlot,
      );
      timeSlot[0].toString().should.be.equal('0');
      timeSlot[1].toString().should.be.equal(totalPayment.toString());
      timeSlot[2].toString().should.be.equal(totalPayment.toString());
      timeSlot[3].toString().should.be.equal('0');
      timeSlot[4].should.be.equal(true);
      timeSlot[5].should.be.equal(false);
    });

    it('Successfully verify notional payment from lender for 1 BTC deal', async () => {
      const [, , bobSigner] = await ethers.getSigners();
      const pv = await loan.getDealPV(loanId);
      console.log(
        'Present value of the loan for 1 BTC deal between Bob and Alice before notional payment settlement: ' +
          pv,
      );

      now = await getLatestTimestamp();
      slotTime = await timeLibrary.addDays(now, 2);

      const requestId = await (
        await settlementEngine
          .connect(bobSigner)
          .verifyPayment(
            alice,
            hexBTCString,
            btcAmount.toString(),
            slotTime.toString(),
            secondTxHash,
          )
      ).wait();

      bobRequestId =
        requestId.events[requestId.events.length - 1].args.requestId;
    });

    it('Validate settlement request by chainlink external adapter and check present value', async () => {
      slotDate = await timeLibrary.timestampToDate(slotTime);
      _2daysTimeSlot = await hashPosition(
        slotDate.year,
        slotDate.month,
        slotDate.day,
      );

      await btcSettlementAdapter.fulfill(
        bobRequestId,
        bobBTCAddress,
        aliceBTCAddress,
        btcAmount.toString(),
        slotTime.toString(),
        secondTxHash,
      );

      let timeSlot = await paymentAggregator.getTimeSlotBySlotId(
        bob,
        alice,
        hexBTCString,
        _2daysTimeSlot,
      );
      timeSlot[0].toString().should.be.equal(btcAmount.toString());
      timeSlot[1].toString().should.be.equal('0');
      timeSlot[2].toString().should.be.equal(btcAmount.toString());
      timeSlot[3].toString().should.be.equal(btcAmount.toString());
      timeSlot[4].should.be.equal(false);
      timeSlot[5].should.be.equal(true);

      const settlementId = computeCrosschainSettlementId(secondTxHash);

      const confirmation =
        await paymentAggregator.getTimeSlotPaymentConfirmationById(
          bob,
          alice,
          hexBTCString,
          _2daysTimeSlot,
          settlementId,
        );
      confirmation[0].should.be.equal(bob);
      confirmation[1].toString().should.be.equal(btcAmount.toString());

      const pv = await loan.getDealPV(loanId);

      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after notional exchange: ' +
          pv.toString(),
      );
    });

    it('Shift time by 6 month, perform mark-to-market and present value updates', async () => {
      let midBTCRates = await lendingMarketController.getMidRatesForCcy(
        hexBTCString,
      );
      console.log(midBTCRates[5].toString());

      let lendBTCRates = await lendingMarketController.getLendRatesForCcy(
        hexBTCString,
      );
      console.log(lendBTCRates[5].toString());

      let borrowBTCRates = await lendingMarketController.getBorrowRatesForCcy(
        hexBTCString,
      );
      console.log(borrowBTCRates[5].toString());
      console.log(
        'Shift time by 6 month, perform mark-to-market for BTC lending deal',
      );

      await advanceTimeAndBlock(180 * ONE_DAY);
      let tx = await loan.markToMarket(loanId);

      const pv = await loan.getDealPV(loanId);
      console.log(pv.toString());
      const settlementLock = toBN(pv.toString())
        .mul(SETTLEMENT_LOCK)
        .div(BP_BASE);
      console.log(settlementLock.toString());
      console.log(
        'Present value of the loan for 1 BTC between Bob after 6 month: ' + pv,
      );

      tx = await collateralAggregator.getCoverage(alice, bob);

      console.group('Collateral coverage for:');
      console.log('Bob (lender) of 1 BTC is ' + tx[1].toString());
      console.log('Alice (borrower) of 1 BTC is ' + tx[0].toString());
      console.groupEnd();

      const ccyExp = await collateralAggregator.getCcyExposures(
        alice,
        bob,
        hexBTCString,
      );
      ccyExp[0].toString().should.be.equal('0');
      ccyExp[1].toString().should.be.equal('0');
      ccyExp[2].toString().should.be.equal(pv.toString());
      ccyExp[3].toString().should.be.equal('0');

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

        let coverage = await collateralAggregator.getCoverage(alice, bob);
        console.group('Collateral coverage for:');
        console.log(
          'Alice (borrower) of 1 BTC and lender of 30 FIL is ' +
            coverage[0].toString(),
        );
        console.log(
          'Bob (lender) of 1 BTC and borrower of 30 FIL is ' +
            coverage[1].toString(),
        );
        console.groupEnd();
      });

      it('Try to liquidate deals', async () => {
        let firstLoanId = generateId(1); // first loan in loan contract
        let secondLoanId = generateId(2); // first loan in loan contract

        await liquidations.liquidateDeals(alice, bob, [
          firstLoanId,
          secondLoanId,
        ]);

        let deal = await loan.getLoanDeal(firstLoanId);
        deal.lender.should.be.equal(zeroAddress);
        deal.borrower.should.be.equal(zeroAddress);

        deal = await loan.getLoanDeal(secondLoanId);
        deal.lender.should.be.equal(zeroAddress);
        deal.borrower.should.be.equal(zeroAddress);

        let lockedCollaterals = await ethVault[
          'getLockedCollateral(address,address)'
        ](alice, bob);
        console.log(
          `LockedCollaterals: ${lockedCollaterals
            .map((value) => value.toString())
            .join(',')}`,
        );

        let coverage = await collateralAggregator.getCoverage(alice, bob);
        console.group('Collateral coverage for:');
        console.log(
          'Alice (borrower) after liquidating all deals is ' +
            coverage[0].toString(),
        );
        console.log(
          'Bob (lender) after liquidating all deals is ' +
            coverage[1].toString(),
        );
        console.groupEnd();
      });
    });
  });
});
