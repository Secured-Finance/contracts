const LendingMarket = artifacts.require('LendingMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');
const PaymentAggregator = artifacts.require('PaymentAggregator');
const CloseOutNetting = artifacts.require('CloseOutNetting');
const CollateralAggregatorV2 = artifacts.require('CollateralAggregatorV2');
const CurrencyController = artifacts.require('CurrencyController');
const MarkToMarket = artifacts.require('MarkToMarket');
const Liquidations = artifacts.require('Liquidations');
const WETH9Mock = artifacts.require('WETH9Mock');

const { emitted, reverted, equal } = require('../test-utils').assert;
const { hexFILString, hexBTCString, hexETHString, loanPrefix, zeroAddress } =
  require('../test-utils').strings;
const {
  sortedTermDays,
  sortedTermsDfFracs,
  sortedTermsNumPayments,
  sortedTermsSchedules,
} = require('../test-utils').terms;
const { checkTokenBalances } = require('../test-utils').balances;

const { toBN } = require('../test-utils').numbers;
const { should } = require('chai');
const utils = require('web3-utils');
const BigNumber = require('bignumber.js');

const {
  ONE_MINUTE,
  ONE_DAY,
  ONE_YEAR,
  NOTICE_GAP,
  SETTLE_GAP,
  advanceTimeAndBlock,
  getLatestTimestamp,
} = require('../test-utils').time;

should();

const expectRevert = reverted;

const ethValue = (wei) => {
  return web3.utils.toWei(web3.utils.toBN(wei), 'ether');
};

const ZERO_BN = toBN('0');
const BP_BASE = toBN('10000');
const SETTLEMENT_LOCK = toBN('2000');

contract('Integration test', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let collateral;
  let loan;
  let lendingController;
  let lendingMarket;
  let btcLendingMarket;
  let termStructure;
  let currencyController;

  let filToETHRate = web3.utils.toBN('67175250000000000');
  let ethToUSDRate = web3.utils.toBN('232612637168');
  let btcToETHRate = web3.utils.toBN('23889912590000000000');

  let decimalBase = web3.utils.toBN('1000000000000000000');

  let filToETHPriceFeed;
  let btcToETHPriceFeed;

  let lendingMarkets = [];
  let btcLendingMarkets = [];

  let aliceOrdersSum = 0;
  let bobOrdersSum = 0;
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
    const DealId = await ethers.getContractFactory('DealId');
    const dealIdLibrary = await DealId.deploy();
    await dealIdLibrary.deployed();

    const QuickSort = await ethers.getContractFactory('QuickSort');
    const quickSortLibrary = await QuickSort.deploy();
    await quickSortLibrary.deployed();

    const DiscountFactor = await ethers.getContractFactory('DiscountFactor');
    const discountFactor = await DiscountFactor.deploy();
    await discountFactor.deployed();

    currencyController = await CurrencyController.new();
    console.log(
      'CurrencyController contract address is ' + currencyController.address,
    );

    const productResolverFactory = await ethers.getContractFactory(
      'ProductAddressResolver',
      {
        libraries: {
          DealId: dealIdLibrary.address,
        },
      },
    );
    productResolver = await productResolverFactory.deploy();
    console.log(
      'ProductAddressResolver contract address is ' + productResolver.address,
    );

    const termStructureFactory = await ethers.getContractFactory(
      'TermStructure',
      {
        libraries: {
          QuickSort: quickSortLibrary.address,
        },
      },
    );
    termStructure = await termStructureFactory.deploy(
      currencyController.address,
      productResolver.address,
    );
    console.log('TermStructure contract address is ' + termStructure.address);

    const loanFactory = await ethers.getContractFactory('LoanV2', {
      libraries: {
        DealId: dealIdLibrary.address,
        DiscountFactor: discountFactor.address,
      },
    });
    loan = await loanFactory.deploy();
    console.log('Loan contract address is ' + loan.address);
    console.log();

    markToMarket = await MarkToMarket.new(productResolver.address);

    wETHToken = await WETH9Mock.new();

    collateral = await CollateralAggregatorV2.new();
    await collateral.setCurrencyController(currencyController.address);
    console.log(
      'Collateral Aggregator contract address is ' + collateral.address,
    );
    console.log();

    paymentAggregator = await PaymentAggregator.new();
    console.log(
      'PaymentAggregator contract address is ' + paymentAggregator.address,
    );

    closeOutNetting = await CloseOutNetting.new(paymentAggregator.address);
    console.log(
      'CloseOutNetting contract address is ' + closeOutNetting.address,
    );

    liquidations = await Liquidations.new(owner, 10);
    await liquidations.setCollateralAggregator(collateral.address, {
      from: owner,
    });
    await liquidations.setProductAddressResolver(productResolver.address, {
      from: owner,
    });
    await liquidations.linkContract(loan.address, { from: owner });
    await collateral.setLiquidationEngine(liquidations.address);

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
    await emitted(tx, 'CcyAdded');

    tx = await currencyController.supportCurrency(
      hexFILString,
      'Filecoin',
      461,
      filToETHPriceFeed.address,
      7500,
      zeroAddress,
    );
    await emitted(tx, 'CcyAdded');

    tx = await currencyController.supportCurrency(
      hexBTCString,
      'Bitcoin',
      0,
      btcToETHPriceFeed.address,
      7500,
      zeroAddress,
    );
    await emitted(tx, 'CcyAdded');

    tx = await currencyController.updateCollateralSupport(hexETHString, true);
    await emitted(tx, 'CcyCollateralUpdate');

    tx = await currencyController.updateMinMargin(hexETHString, 2500);
    await emitted(tx, 'MinMarginUpdated');

    await collateral.setCurrencyController(currencyController.address, {
      from: owner,
    });
    await liquidations.setCurrencyController(currencyController.address, {
      from: owner,
    });
    await loan.setCollateralAddr(collateral.address, { from: owner });

    const crosschainResolverFactory = await ethers.getContractFactory(
      'CrosschainAddressResolver',
    );
    crosschainResolver = await crosschainResolverFactory.deploy(
      collateral.address,
    );
    await crosschainResolver.deployed();
    console.log(
      'CrosschainAddressResolver contract address is ' +
        crosschainResolver.address,
    );
    await collateral.setCrosschainAddressResolver(crosschainResolver.address);

    const CollateralVault = await ethers.getContractFactory('CollateralVault');

    ethVault = await CollateralVault.deploy(
      hexETHString,
      wETHToken.address,
      collateral.address,
      currencyController.address,
      wETHToken.address,
    );
    await collateral.linkCollateralVault(ethVault.address);
    console.log('ethVault is ' + ethVault.address);

    await paymentAggregator.addPaymentAggregatorUser(loan.address);
    await paymentAggregator.setCloseOutNetting(closeOutNetting.address);
    let status = await paymentAggregator.isPaymentAggregatorUser(loan.address);
    status.should.be.equal(true);

    await paymentAggregator.setMarkToMarket(markToMarket.address);

    await loan.setPaymentAggregator(paymentAggregator.address, { from: owner });
    await loan.setLiquidations(liquidations.address, { from: owner });

    const lendingControllerFactory = await ethers.getContractFactory(
      'LendingMarketController',
      {
        libraries: {
          QuickSort: quickSortLibrary.address,
          DiscountFactor: discountFactor.address,
        },
      },
    );
    lendingController = await lendingControllerFactory.deploy();
    console.log(
      'LendingMarketController contract address is ' +
        lendingController.address,
    );
    console.log();

    await productResolver.registerProduct(
      loanPrefix,
      loan.address,
      lendingController.address,
      { from: owner },
    );

    let contract = await productResolver.getProductContract(loanPrefix);
    contract.should.be.equal(loan.address);

    contract = await productResolver.getControllerContract(loanPrefix);
    contract.should.be.equal(lendingController.address);

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

    await lendingController.setCurrencyController(currencyController.address, {
      from: owner,
    });
    await lendingController.setTermStructure(termStructure.address);
    await loan.setLendingControllerAddr(lendingController.address, {
      from: owner,
    });
    await loan.setTermStructure(termStructure.address);
    await collateral.addCollateralUser(loan.address, { from: owner });
  });

  describe('Prepare markets and users for lending deals', async () => {
    it('Deploy Lending Markets with each Term for FIL market', async () => {
      for (i = 0; i < sortedTermDays.length; i++) {
        const tx = await lendingController.deployLendingMarket(
          hexFILString,
          sortedTermDays[i],
        );
        const receipt = await tx.wait();
        lendingMarkets.push(receipt.events[0].args.marketAddr);

        let lendingMarket = await LendingMarket.at(
          receipt.events[0].args.marketAddr,
        );
        await lendingMarket.setCollateral(collateral.address, { from: owner });
        await lendingMarket.setLoan(loan.address, { from: owner });
        await collateral.addCollateralUser(lendingMarket.address, {
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
        const tx = await lendingController.deployLendingMarket(
          hexBTCString,
          sortedTermDays[i],
        );
        const receipt = await tx.wait();
        btcLendingMarkets.push(receipt.events[0].args.marketAddr);

        let btcLendingMarket = await LendingMarket.at(
          receipt.events[0].args.marketAddr,
        );
        await btcLendingMarket.setCollateral(collateral.address, {
          from: owner,
        });
        await btcLendingMarket.setLoan(loan.address, { from: owner });

        await collateral.addCollateralUser(btcLendingMarket.address, {
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

    it('Check if collateral users linked correctly', async () => {
      let result;

      for (i = 0; i < sortedTermDays.length; i++) {
        let result = await collateral.isCollateralUser(lendingMarkets[i]);
        result.should.be.equal(true);
      }

      for (i = 0; i < sortedTermDays.length; i++) {
        let result = await collateral.isCollateralUser(btcLendingMarkets[i]);
        result.should.be.equal(true);
      }

      result = await collateral.isCollateralUser(loan.address);
      result.should.be.equal(true);

      result = await collateral.isCollateralUser(
        '0x0000000000000000000000000000000000000001',
      );
      result.should.be.equal(false);
    });

    it('Register collateral book for Carol with 90 ETH and check Carol collateral book', async () => {
      const [, , , carolSigner] = await ethers.getSigners();
      await collateral.register({ from: carol });

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

      let vaults = await collateral.getUsedVaults(carol);
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
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(300);

      _3mMarket = await LendingMarket.at(btcLendingMarkets[0]);
      marketOrder = await _3mMarket.order(0, '1000000000', 300, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
      marketOrder = await _6mMarket.order(0, ethValue(310), 1020, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(310);

      _6mMarket = await LendingMarket.at(btcLendingMarkets[1]);
      marketOrder = await _6mMarket.order(0, '1000000000', 310, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
      marketOrder = await _1yMarket.order(0, ethValue(320), 1120, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(320);

      _1yMarket = await LendingMarket.at(btcLendingMarkets[2]);
      marketOrder = await _1yMarket.order(0, '1000000000', 320, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
      marketOrder = await _2yMarket.order(0, ethValue(330), 1220, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(330);

      _2yMarket = await LendingMarket.at(btcLendingMarkets[3]);
      marketOrder = await _2yMarket.order(0, '1000000000', 330, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
      marketOrder = await _3yMarket.order(0, ethValue(340), 1320, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(340);

      _3yMarket = await LendingMarket.at(btcLendingMarkets[4]);
      marketOrder = await _3yMarket.order(0, '1000000000', 340, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
      marketOrder = await _5yMarket.order(0, ethValue(350), 1520, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(350);

      _5yMarket = await LendingMarket.at(btcLendingMarkets[5]);
      marketOrder = await _5yMarket.order(0, '1000000000', 350, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);
    });

    it('Make borrow orders by Carol', async () => {
      let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
      marketOrder = await _3mMarket.order(1, ethValue(300), 680, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(300);

      _3mMarket = await LendingMarket.at(btcLendingMarkets[0]);
      marketOrder = await _3mMarket.order(1, '1000000000', 270, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
      marketOrder = await _6mMarket.order(1, ethValue(310), 780, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(310);

      _6mMarket = await LendingMarket.at(btcLendingMarkets[1]);
      marketOrder = await _6mMarket.order(1, '1000000000', 280, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
      marketOrder = await _1yMarket.order(1, ethValue(320), 880, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(320);

      _1yMarket = await LendingMarket.at(btcLendingMarkets[2]);
      marketOrder = await _1yMarket.order(1, '1000000000', 290, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
      marketOrder = await _2yMarket.order(1, ethValue(330), 980, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(330);

      _2yMarket = await LendingMarket.at(btcLendingMarkets[3]);
      marketOrder = await _2yMarket.order(1, '1000000000', 300, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
      marketOrder = await _3yMarket.order(1, ethValue(340), 1080, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(340);

      _3yMarket = await LendingMarket.at(btcLendingMarkets[4]);
      marketOrder = await _3yMarket.order(1, '1000000000', 310, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);

      let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
      marketOrder = await _5yMarket.order(1, ethValue(350), 1280, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(350);

      _5yMarket = await LendingMarket.at(btcLendingMarkets[5]);
      marketOrder = await _5yMarket.order(1, '1000000000', 320, {
        from: carol,
      });
      await emitted(marketOrder, 'MakeOrder');
      carolOrdersSum = carolOrdersSum + ethValue(0, 000000001);
    });
  });

  describe('Test Deposit and Withraw collateral by Alice', async () => {
    it('Register collateral book without payment', async () => {
      let btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
      let filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';
      let result = await collateral.methods['register(string[],uint256[])'](
        [btcAddress, filAddress],
        [0, 461],
        { from: alice },
      );

      await emitted(result, 'Register');
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

      let vaults = await collateral.getUsedVaults(alice);
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
      let result = await collateral.register({ from: bob });
      await emitted(result, 'Register');

      const [, , bobSigner] = await ethers.getSigners();
      let depositAmt = web3.utils.toBN('1000000000000000000');

      await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      let vaults = await collateral.getUsedVaults(bob);
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

      // web3.eth.getBalance(alice).then((res) => {
      //     res.should.be.equal(balance.sub(web3.utils.toBN("1000000000000000000")).toString());
      // });
    });

    it('Expect revert on making order for 100 FIL', async () => {
      await expectRevert(
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
      await emitted(marketOrder, 'MakeOrder');
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

      let exp = await collateral.getTotalUnsettledExp(alice);
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
      let coverage = await collateral.getUnsettledCoverage(alice);

      const totalUnsettledExp = await collateral.getTotalUnsettledExp(alice);
      let manualCoverage = web3.utils
        .toBN(independentCollateral)
        .mul(web3.utils.toBN(10000))
        .div(totalUnsettledExp);
      coverage.toNumber().should.be.equal(manualCoverage.toNumber());
    });

    it('Expect withdrawing maximum available amount instead of widthdrawing 0.9 ETH by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let withdrawal = web3.utils.toBN('900000000000000000');
      let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(
        alice,
      );

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
      let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(
        alice,
      );
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

      // await expectRevert(
      //     lendingMarket.cancelOrder(1, {from: alice}),
      //     "No access to cancel order"
      // );

      let tx = await lendingMarket.cancelOrder(3, { from: alice });
      if (tx.receipt.gasUsed != null) {
        balance = await balance.sub(
          web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice),
        );
      }
      await emitted(tx, 'CancelOrder');

      const totalUnsettledExp = await collateral.getTotalUnsettledExp(alice);
      totalUnsettledExp.toString().should.be.equal('0');

      let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(
        alice,
      );
      maxWidthdrawal
        .toString()
        .should.be.equal(aliceIndependentAmount.toString());
    });

    it('Successfully widthdraw left collateral by Alice', async () => {
      const [, aliceSigner] = await ethers.getSigners();
      let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(
        alice,
      );
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
      let marketOrder = await lendingMarket.order(0, filAmount, 725, {
        from: alice,
      });
      await emitted(marketOrder, 'MakeOrder');

      console.log('');
      console.log('Alice ETH address ' + alice);
      console.log('Bob ETH address ' + bob);

      let receipt = await (
        await ethVault
          .connect(bobSigner)
          ['deposit(uint256)'](depositAmt.toString(), {
            value: depositAmt.toString(),
          })
      ).wait();

      let filUsed = filAmount
        .mul(web3.utils.toBN(15000))
        .div(web3.utils.toBN(10000));
      let filInETH = await currencyController.convertToETH(
        hexFILString,
        filAmount,
        { from: alice },
      );
      console.log('');
      console.log('FIL in ETH is: ' + filInETH);

      console.log('');
      console.log('Taking order for 30 FIL, and using collateral');
      console.log('');

      marketOrder = await lendingMarket.order(1, filAmount, 725, { from: bob });
      await emitted(marketOrder, 'TakeOrder');

      let lockedCollaterals = await ethVault[
        'getLockedCollateral(address,address)'
      ](alice, bob);
      aliceLockedCollateral = lockedCollaterals[0];

      aliceIndependentAmount = await aliceIndependentAmount.sub(
        toBN(aliceLockedCollateral),
      );

      let rebalance = await collateral.getRebalanceCollateralAmounts(
        alice,
        bob,
      );
      rebalance[1].toString().should.be.equal('0');
      rebalance[0].toString().should.be.equal('0');

      console.log('');
      console.log(
        'Calculating collateral coverage after registering loan deal for 30 FIL',
      );
      console.log('');

      tx = await collateral.getCoverage(alice, bob);

      console.log(
        'Collateral coverage for Bob (borrower) of 30 FIL is ' +
          tx[0].toString(),
      );
      console.log(
        'Collateral coverage for Alice (lender) of 30 FIL is ' +
          tx[1].toString(),
      );
      console.log('');
    });

    it('Shift time by 3 month, perform mark-to-market and present value updates', async () => {
      // await advanceTimeAndBlock(90 * ONE_DAY);
      tx = await loan.functions['markToMarket(bytes32)'](loanId);
      // await emitted(tx, 'MarkToMarket');

      const pv = await loan.getDealPV(loanId);
      const settlementLock = toBN(pv.toString())
        .mul(SETTLEMENT_LOCK)
        .div(BP_BASE);

      console.log('Performing second mark-to-market after 3 month');
      console.log(
        'Present value of the loan for 30 FIL between Alice and Bob after first payment settlment: ' +
          pv,
      );
      console.log('');

      const ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
      ccyExp[0].toString().should.be.equal(settlementLock.toString());
      ccyExp[1].toString().should.be.equal(pv.toString());
    });
  });

  describe('Test second loan by Alice and Bob for 1 BTC', async () => {
    const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
    loanId = generateId(2);

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
      lockedCollateral
        .toString()
        .should.be.equal(aliceLockedCollateral.toString());

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
      console.log('');

      let marketOrder = await btcLendingMarket.order(0, btcAmount, 305, {
        from: bob,
      });
      await emitted(marketOrder, 'MakeOrder');

      console.log(
        'Taking order for 1 BTC, and using collateral by Alice as a borrower',
      );
      console.log('');

      marketOrder = await btcLendingMarket.order(1, btcAmount, 305, {
        from: alice,
      });
      await emitted(marketOrder, 'TakeOrder');

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
      console.log('');

      let rebalance = await collateral.getRebalanceCollateralAmounts(
        alice,
        bob,
      );
      rebalance[1].toString().should.be.equal('0');
      rebalance[0].toString().should.be.equal('0');

      console.log(
        'Calculating collateral coverage after registering loan deal for 30 FIL',
      );
      console.log('');

      tx = await collateral.getCoverage(alice, bob);
      console.log('');
      console.log(
        'Collateral coverage for Bob (lender) of 1 BTC is ' + tx[1].toString(),
      );
      console.log(
        'Collateral coverage for Alice (borrower) of 1 BTC is ' +
          tx[0].toString(),
      );
    });

    it('Shift time by 6 month, perform mark-to-market and present value updates', async () => {
      const dfs = await lendingController.getDiscountFactorsForCcy(
        hexBTCString,
      );
      // console.log(dfs);

      let midBTCRates = await lendingController.getMidRatesForCcy(hexBTCString);
      console.log(midBTCRates[5].toString());

      let lendBTCRates = await lendingController.getLendRatesForCcy(
        hexBTCString,
      );
      console.log(lendBTCRates[5].toString());

      let borrowBTCRates = await lendingController.getBorrowRatesForCcy(
        hexBTCString,
      );
      console.log(borrowBTCRates[5].toString());

      console.log('');
      console.log(
        'Shift time by 6 month, perform mark-to-market for BTC lending deal',
      );

      await advanceTimeAndBlock(180 * ONE_DAY);
      let tx = await loan.markToMarket(loanId);
      // await emitted(tx, 'MarkToMarket');

      const pv = await loan.getDealPV(loanId);
      console.log(pv.toString());
      const settlementLock = toBN(pv.toString())
        .mul(SETTLEMENT_LOCK)
        .div(BP_BASE);
      console.log(settlementLock.toString());

      console.log('');
      console.log(
        'Present value of the loan for 1 BTC between Bob after 6 month: ' + pv,
      );

      tx = await collateral.getCoverage(alice, bob);

      console.log('');
      console.log(
        'Collateral coverage for Bob (lender) of 1 BTC is ' + tx[1].toString(),
      );
      console.log(
        'Collateral coverage for Alice (borrower) of 1 BTC is ' +
          tx[0].toString(),
      );

      const ccyExp = await collateral.getCcyExposures(alice, bob, hexBTCString);
      ccyExp[0].toString().should.be.equal(pv.toString());
      ccyExp[1].toString().should.be.equal(settlementLock.toString());

      // let rebalance = await collateral.getRebalanceCollateralAmounts(alice, bob);
      // rebalance[1].toString().should.be.equal('0');
      // rebalance[0].toString().should.be.equal('0');
    });

    describe('Test Liquidations for registered loans', async () => {
      it('Increase FIL exchange rate by 25%, check collateral coverage', async () => {
        const newPrice = filToETHRate
          .mul(web3.utils.toBN('125'))
          .div(web3.utils.toBN('100'));
        await filToETHPriceFeed.updateAnswer(newPrice);

        let coverage = await collateral.getCoverage(alice, bob);
        console.log('');
        console.log(
          'Collateral coverage for Alice (borrower) of 1 BTC and lender of 30 FIL is ' +
            coverage[0].toString(),
        );
        console.log(
          'Collateral coverage for Bob (lender) of 1 BTC and borrower of 30 FIL is ' +
            coverage[1].toString(),
        );
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
        console.log(lockedCollaterals);

        let coverage = await collateral.getCoverage(alice, bob);
        console.log('');
        console.log(
          'Collateral coverage for Alice (borrower) after liquidating all deals is ' +
            coverage[0].toString(),
        );
        console.log(
          'Collateral coverage for Bob (lender) after liquidating all deals is ' +
            coverage[1].toString(),
        );
      });
    });
  });
});
