const CollateralAggregator = artifacts.require('CollateralAggregator');
const Loan = artifacts.require('Loan');
const LendingMarketController = artifacts.require('LendingMarketController');
const CurrencyController = artifacts.require('CurrencyController');
const LendingMarket = artifacts.require('LendingMarket');
const MockV3Aggregator = artifacts.require('MockV3Aggregator');

const { emitted, reverted, equal } = require('../test-utils').assert;
const {Ccy, Term} = require('../test-utils').constants;
const {toBytes32} = require('../test-utils').strings;
const { should } = require('chai');
const { ONE_MINUTE, ONE_DAY,  ONE_YEAR, NOTICE_GAP, SETTLE_GAP, advanceTimeAndBlock, getLatestTimestamp } = require('../test-utils').time;

should();

const expectRevert = reverted;

const ethValue = (wei) => {
    return web3.utils.toWei(web3.utils.toBN(wei), 'ether');
}

contract('CollateralAggregator', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;

    let collateral;
    let ratesAggregator;
    let loan;
    let lendingController;
    let lendingMarket;
    let btcLendingMarket;

    let filToETHRate = web3.utils.toBN("67175250000000000");
    let ethToUSDRate = web3.utils.toBN("232612637168");
    let btcToETHRate = web3.utils.toBN("23889912590000000000");

    let decimalBase = web3.utils.toBN("1000000000000000000");

    let filToETHPriceFeed;
    let btcToETHPriceFeed;
    let usdcToETHPriceFeed;

    let lendingMarkets = [];
    let btcLendingMarkets = [];
    let usdcLendingMarkets = [];

    let hexFILString = toBytes32("FIL");
    let hexETHString = toBytes32("ETH");
    let hexBTCString = toBytes32("BTC");

    let aliceOrdersSum = 0;
    let bobOrdersSum = 0;
    let carolOrdersSum = 0;

    let aliceIndependentAmount;
    let aliceLockedCollateral;

    let carolInitialCollateral = web3.utils.toBN("90000000000000000000");

    before('deploy Collateral, Loan, LendingMarket smart contracts', async () => {
        loan = await Loan.new();

        collateral = await CollateralAggregator.new();
        
        currencyController = await CurrencyController.new();
        filToETHPriceFeed = await MockV3Aggregator.new(18, Ccy.FIL, filToETHRate);
        ethToUSDPriceFeed = await MockV3Aggregator.new(8, Ccy.ETH, ethToUSDRate);
        btcToETHPriceFeed = await MockV3Aggregator.new(18, Ccy.BTC, btcToETHRate);

        let tx = await currencyController.supportCurrency(hexETHString, "Ethereum", 60, ethToUSDPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        tx = await currencyController.supportCurrency(hexFILString, "Filecoin", 461, filToETHPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        tx = await currencyController.supportCurrency(hexBTCString, "Bitcoin", 0, btcToETHPriceFeed.address, 7500);
        await emitted(tx, 'CcyAdded');

        tx = await currencyController.updateCollateralSupport(hexETHString, true);
        await emitted(tx, 'CcyCollateralUpdate');

        tx = await currencyController.updateMinMargin(hexETHString, 2500);
        await emitted(tx, 'MinMarginUpdated');

        await collateral.setCurrencyControler(currencyController.address, {from: owner});
        await loan.setCollateralAddr(collateral.address, {from: owner});

        lendingController = await LendingMarketController.new({from: owner});
        tx = await lendingController.setCurrencyController(currencyController.address, {from: owner});
        await loan.setLendingControllerAddr(lendingController.address, {from: owner});    
        await collateral.addCollateralUser(loan.address, {from: owner});
    });

    describe('Prepare markets and users for lending deals', async () => {
        it('Deploy Lending Markets with each Term for FIL market', async () => {
            for (i=0; i < 6; i++) {
                let market = await lendingController.deployLendingMarket(hexFILString, i, {from: owner});
                await emitted(market, "LendingMarketCreated");
                lendingMarkets.push(market.logs[0].args.marketAddr);

                let lendingMarket = await LendingMarket.at(market.logs[0].args.marketAddr);
                await lendingMarket.setCollateral(collateral.address, {from: owner});
                await lendingMarket.setLoan(loan.address, {from: owner});

                await collateral.addCollateralUser(lendingMarket.address, {from: owner});
                await loan.addLendingMarket(hexFILString, i, lendingMarket.address, {from: owner});
            }

            lendingMarket = await LendingMarket.at(lendingMarkets[2]);
        });

        it('Deploy Lending Markets with each Term for BTC market', async () => {
            for (i=0; i < 6; i++) {
                let market = await lendingController.deployLendingMarket(hexBTCString, i, {from: owner});
                await emitted(market, "LendingMarketCreated");
                btcLendingMarkets.push(market.logs[0].args.marketAddr);

                let btcLendingMarket = await LendingMarket.at(market.logs[0].args.marketAddr);
                await btcLendingMarket.setCollateral(collateral.address, {from: owner});
                await btcLendingMarket.setLoan(loan.address, {from: owner});

                await collateral.addCollateralUser(btcLendingMarket.address, {from: owner});
                await loan.addLendingMarket(hexBTCString, i, btcLendingMarket.address, {from: owner});
            }

            btcLendingMarket = await LendingMarket.at(btcLendingMarkets[5]);
        });

        it('Check if collateral users linked correctly', async() => {
            let result;

            for (i=0; i < 6; i++) {
                let result = await collateral.isCollateralUser(lendingMarkets[i]);
                result.should.be.equal(true);
            }

            for (i=0; i < 6; i++) {
                let result = await collateral.isCollateralUser(btcLendingMarkets[i]);
                result.should.be.equal(true);
            }

            result = await collateral.isCollateralUser(loan.address);
            result.should.be.equal(true);

            result = await collateral.isCollateralUser("0x0000000000000000000000000000000000000001");
            result.should.be.equal(false);
        });

        it('Register collateral book for Carol with 90 ETH and check Carol collateral book', async () => {
            let result = await collateral.register({from: carol, value: carolInitialCollateral});
            await emitted(result, 'Register');

            const book = await collateral.getCollateralBook(carol);    
            book[0].should.be.equal('0');
            book[1].should.be.equal(carolInitialCollateral.toString());
            book[2].should.be.equal('0');
        });

        it('Make lend orders by Carol', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, ethValue(300), 920, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(300);

            _3mMarket = await LendingMarket.at(btcLendingMarkets[0]);
            marketOrder = await _3mMarket.order(0, '1000000000', 300, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, ethValue(310), 1020, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(310);

            _6mMarket = await LendingMarket.at(btcLendingMarkets[1]);
            marketOrder = await _6mMarket.order(0, '1000000000', 310, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, ethValue(320), 1120, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(320);

            _1yMarket = await LendingMarket.at(btcLendingMarkets[2]);
            marketOrder = await _1yMarket.order(0, '1000000000', 320, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, ethValue(330), 1220, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(330);

            _2yMarket = await LendingMarket.at(btcLendingMarkets[3]);
            marketOrder = await _2yMarket.order(0, '1000000000', 330, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, ethValue(340), 1320, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(340);

            _3yMarket = await LendingMarket.at(btcLendingMarkets[4]);
            marketOrder = await _3yMarket.order(0, '1000000000', 340, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, ethValue(350), 1520, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(350);

            _5yMarket = await LendingMarket.at(btcLendingMarkets[5]);
            marketOrder = await _5yMarket.order(0, '1000000000', 350, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);
        });
        it('Make borrow orders by Carol', async () => {
            let _3mMarket = await LendingMarket.at(lendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, ethValue(300), 680, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(300);

            _3mMarket = await LendingMarket.at(btcLendingMarkets[0]);
            marketOrder = await _3mMarket.order(1, "1000000000", 270, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _6mMarket = await LendingMarket.at(lendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, ethValue(310), 780, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(310);

            _6mMarket = await LendingMarket.at(btcLendingMarkets[1]);
            marketOrder = await _6mMarket.order(1, '1000000000', 280, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _1yMarket = await LendingMarket.at(lendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, ethValue(320), 880, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(320);

            _1yMarket = await LendingMarket.at(btcLendingMarkets[2]);
            marketOrder = await _1yMarket.order(1, '1000000000', 290, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _2yMarket = await LendingMarket.at(lendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, ethValue(330), 980, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(330);

            _2yMarket = await LendingMarket.at(btcLendingMarkets[3]);
            marketOrder = await _2yMarket.order(1, '1000000000', 300, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _3yMarket = await LendingMarket.at(lendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, ethValue(340), 1080, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(340);

            _3yMarket = await LendingMarket.at(btcLendingMarkets[4]);
            marketOrder = await _3yMarket.order(1, '1000000000', 310, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);

            let _5yMarket = await LendingMarket.at(lendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, ethValue(350), 1280, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(350);

            _5yMarket = await LendingMarket.at(btcLendingMarkets[5]);
            marketOrder = await _5yMarket.order(1, '1000000000', 320, {from: carol});
            await emitted(marketOrder, 'MakeOrder');
            carolOrdersSum = carolOrdersSum + ethValue(0,000000001);
        });
    });

    describe('Test functions with onlyOwner modifier', async () => {
        it('Try to link LendingMarket by Bob, expect revert', async () => {
            await expectRevert(
                collateral.addCollateralUser("0x0000000000000000000000000000000000000000", {from: bob}), ""
            );
        });

        it('Try to link existing LendingMarket by Owner, expect revert', async () => {
            await expectRevert(
                collateral.addCollateralUser(lendingMarket.address, {from: owner}), "Can't add existing address"
            );
        });

        it('Try to set FXRatesAggregator by Bob, expect revert', async () => {
            await expectRevert(
                collateral.setCurrencyControler(loan.address, {from: bob}), ""
            );
        });

        it('Try to set FXRatesAggregator with zero address by Owner, expect revert', async () => {
            await expectRevert(
                collateral.setCurrencyControler('0x0000000000000000000000000000000000000000', {from: owner}), "Zero address"
            );
        });
    });

    describe("Register collateral book for Alice", async () => {
        it('Register collateral book without payment', async () => {
            let result = await collateral.register({from: alice});
            await emitted(result, 'Register');
        });

        it('Revert on second register collateral book', async () => {
            await expectRevert(
                collateral.register({from: alice}), 
                "book registered already"
            );
        });

        it('Get Alice collateral book and check values', async () => {
            const book = await collateral.getCollateralBook(alice);    
            book[0].should.be.equal('0');
            book[1].should.be.equal('0');
            book[2].should.be.equal('0');
        });
    });

    describe("Test Deposit and Withraw collateral by Alice", async () => {
        it('Deposit 10 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            let depositAmt = web3.utils.toBN('10000000000000000000');

            let tx = await collateral.deposit({from: alice, value: depositAmt});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');
            
            aliceIndependentAmount = await depositAmt;

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(aliceIndependentAmount).toString());
            });
        });

        it('Deposit 13,5252524 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            let depositAmt = web3.utils.toBN('13525252400000000000');

            let tx = await collateral.deposit({from: alice, value: depositAmt});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');
            
            aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(depositAmt).toString());
            });
        });

        it('Try to Withdraw 30 ETH from Collateral by Alice but withdraw maximum amount of independent collateral, ', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));

            let tx = await collateral.withdraw(web3.utils.toBN("30000000000000000000"), {from: alice});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Withdraw');

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal('0');
            book[2].should.be.equal('0');

            await web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.add(aliceIndependentAmount).toString());
            });

            aliceIndependentAmount = await aliceIndependentAmount.sub(aliceIndependentAmount);
        });

        it('Register collateral book by Bob with 1 ETH deposit', async () => {
            let result = await collateral.register({from: bob, value: 1000000000000000000});
            await emitted(result, 'Register');

            const book = await collateral.getCollateralBook(bob);
            book[0].should.be.equal('0');
            book[1].should.be.equal('1000000000000000000');
            book[2].should.be.equal('0');
        });

        it('Deposit 2 ETH by Bob in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(bob).then((res) => balance = web3.utils.toBN(res));
            
            let tx = await collateral.deposit({from: bob, value: 2000000000000000000});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');

            const book = await collateral.getCollateralBook(bob);
            book[0].should.be.equal('0');
            book[1].should.be.equal('3000000000000000000');
            book[2].should.be.equal('0');

            web3.eth.getBalance(bob).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("2000000000000000000")).toString());
            });
        });

        it('Try to withdraw 1 ETH from empty collateral book by Alice, expect no change in Alice balance', async () => {
            let balance;
            let gasPrice;

            await web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));
            await web3.eth.getBalance(alice).then((res) => {
                balance = web3.utils.toBN(res)
            });

            let tx = await collateral.withdraw(web3.utils.toBN("1000000000000000000"), {from: alice});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("0")).toString());
            });
        });
    });

    describe("Test making new orders on FIL LendingMarket, and check collateral usage", async () => {
        it('Deposit 1 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            
            let depositAmt = web3.utils.toBN("1000000000000000000")
            let tx = await collateral.deposit({from: alice, value: depositAmt});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');

            aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);
            
            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("1000000000000000000")).toString());
            });
        });

        it('Expect revert on making order for 100 FIL', async () => {
            await expectRevert(
                lendingMarket.order(0, web3.utils.toBN("100000000000000000000"), 700, {from: alice}), 
                "Not enough collateral"
            );
        });

        it('Successfully make order for 10 FIL', async () => {
            let marketOrder = await lendingMarket.order(0, web3.utils.toBN("10000000000000000000"), 725, {from: alice});
            await emitted(marketOrder, 'MakeOrder');
        });

        it('Check Alice collateral book usage, and total unsettled exposure calculations', async () => {
            let filUsed = (web3.utils.toBN("10000000000000000000").mul(web3.utils.toBN(2000))).div(web3.utils.toBN(10000));
            let filInETH = await currencyController.convertToETH(hexFILString, filUsed, {from: alice});
            
            let exp = await collateral.getTotalUnsettledExp(alice);
            exp.toString().should.be.equal(filInETH.toString());

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');
        });

        it('Calculate collateral coverage of the global collateral book, expect to be equal with manual calculations', async () => {
            const book = await collateral.getCollateralBook(alice);
            let coverage = await collateral.getUnsettledCoverage(alice);

            const totalUnsettledExp = await collateral.getTotalUnsettledExp(alice);
            let manualCoverage = (web3.utils.toBN(book.independentAmount).mul(web3.utils.toBN(10000))).div(totalUnsettledExp);
            coverage.toNumber().should.be.equal(manualCoverage.toNumber());
        });

        it('Expect withdrawing maximum available amount instead of widthdrawing 0.9 ETH by Alice', async () => {
            let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(alice);
            let widthdrawal = await collateral.withdraw(web3.utils.toBN("900000000000000000"), {from: alice});
            await emitted(widthdrawal, 'Withdraw');

            aliceIndependentAmount = await aliceIndependentAmount.sub(maxWidthdrawal);

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');
        });

        it('Expect withdrawing 0 instead of widthdrawing 0.1 ETH by Alice', async () => {
            let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(alice);
            let widthdrawal = await collateral.withdraw(web3.utils.toBN("100000000000000000"), {from: alice});
            await emitted(widthdrawal, 'Withdraw');

            aliceIndependentAmount = await aliceIndependentAmount.sub(maxWidthdrawal);

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');
        });
    });

    describe("Test release collateral functions by canceling lending orders FIL", async () => {
        it('Successfully cancel order for 100 FIL, expect independent amount to be fully unlocked', async () => {
            let balance;
            let gasPrice;
            await web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));
            await web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));

            // await expectRevert(
            //     lendingMarket.cancelOrder(1, {from: alice}), 
            //     "No access to cancel order"
            // );

            let tx = await lendingMarket.cancelOrder(3, {from: alice});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'CancelOrder');

            const totalUnsettledExp = await collateral.getTotalUnsettledExp(alice);
            totalUnsettledExp.toString().should.be.equal("0");

            let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(alice);
            maxWidthdrawal.toString().should.be.equal(aliceIndependentAmount.toString());
        });

        it('Successfully widthdraw left collateral by Alice', async () => {
            let balance;
            let gasPrice;
            await web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));
            await web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            let maxWidthdrawal = await collateral.getMaxCollateralBookWidthdraw(alice);

            let tx = await collateral.withdraw(web3.utils.toBN("1000000000000000000"), {from: alice});
            await emitted(tx, 'Withdraw');
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }

            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal('0');
            book[2].should.be.equal('0');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.add(maxWidthdrawal).toString());
            });

            aliceIndependentAmount = await aliceIndependentAmount.sub(maxWidthdrawal)
        });
    });

    describe("Test making new orders on FIL LendingMarket by Alice, and taking orders by Bob", async () => {
        const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
        let loanId = 1; // first loan in loan contract
        let filAmount = web3.utils.toBN("30000000000000000000")

        it('Deposit 1 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            
            let depositAmt = web3.utils.toBN("1000000000000000000")
            let tx = await collateral.deposit({from: alice, value: depositAmt});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');

            aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);
            
            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal('0');

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(web3.utils.toBN("1000000000000000000")).toString());
            });
        });

        it('Successfully make order for 30 FIL by Alice, take this order by Bob', async () => {
            let depositAmt = web3.utils.toBN('1000000000000000000');
            let marketOrder = await lendingMarket.order(0, filAmount, 725, {from: alice});
            await emitted(marketOrder, 'MakeOrder');

            // await expectRevert(
            //     lendingMarket.order(1, filAmount, 725, {from: bob}), 
            //     "SafeMath: subtraction overflow"
            // );

            console.log("");
            console.log("Alice ETH address " + alice);
            console.log("Bob ETH address " + bob);

            let tx = await collateral.deposit({from: bob, value: depositAmt});
            await emitted(tx, 'Deposit');

            let filUsed = (filAmount.mul(web3.utils.toBN(15000))).div(web3.utils.toBN(10000));
            let filInETH = await currencyController.convertToETH(hexFILString, filAmount, {from: alice});
            console.log("");
            console.log("FIL in ETH is: " + filInETH);

            console.log("");
            console.log("Taking order for 30 FIL, and using collateral");
            console.log("");

            marketOrder = await lendingMarket.order(1, filAmount, 725, {from: bob});
            await emitted(marketOrder, 'TakeOrder');


            let aliceReqCollateral = await collateral.getBilateralPosition(alice, bob);
            aliceLockedCollateral = aliceReqCollateral.lockedCollateralB;
            aliceIndependentAmount = await aliceIndependentAmount.sub(web3.utils.toBN(aliceReqCollateral.lockedCollateralB));

            let rebalance = await collateral.getRebalanceCollateralAmounts(alice, bob);
            rebalance[1].toString().should.be.equal('0');
            rebalance[0].toString().should.be.equal('0');

            console.log("");
            console.log("Calculating collateral coverage after registering loan deal for 30 FIL");
            console.log("");

            tx = await collateral.getCoverage(alice, bob);

            console.log("Collateral coverage for Bob (borrower) of 30 FIL is " + tx[0].toString());
            console.log("Collateral coverage for Alice (lender) of 30 FIL is " + tx[1].toString());
            console.log("");
        });

        it('Succesfully notify payment by Alice for 30 FIL', async () => {
            let notification = await loan.notifyPayment(loanId, filAmount, txHash, {from: alice});
            await emitted(notification, 'NotifyPayment');

            console.log("");
            console.log("Notifying borrower for succesful transfer of 30 FIL by Alice (lender)");
            console.log("");
        });

        it('Succesfully confirm payment by Bob for 30 FIL and check the settled exposure in bilateral position', async () => {

            let pv = await loan.getCurrentPV(loanId);
            pv.toString().should.be.equal(filAmount.toString());

            console.log("Present value of the loan for 30 FIL between Alice and Bob before first payment settlment: " + pv)
            console.log("");

            let confirmation = await loan.confirmPayment(loanId, filAmount, txHash, {from: bob});
            await emitted(confirmation, 'ConfirmPayment');
            
            console.log("");
            console.log("Confirming succesful transfer for 30 FIL by Bob (borrower)");
            console.log("");

            const totalUnsettledExp = await collateral.getTotalUnsettledExp(alice);
            totalUnsettledExp.toString().should.be.equal("0");

            console.log("Performing first mark-to-market after notional transfer settlement");

            tx = await loan.markToMarket(loanId, {from: alice});
            await emitted(tx, 'MarkToMarket');

            pv = await loan.getCurrentPV(loanId);

            console.log("Present value of the loan for 30 FIL between Alice and Bob after first payment settlment: " + pv)
            console.log("");

            const ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            ccyExp.party0PV.should.be.equal(pv.toString());
            ccyExp.party1PV.should.be.equal('0');
            ccyExp.netPayment.should.be.equal(pv.toString());
        });

        it("Shift time by 3 month, perform mark-to-market and present value updates", async () => {
            await advanceTimeAndBlock(90 * ONE_DAY);
            tx = await loan.markToMarket(loanId, {from: alice});
            await emitted(tx, 'MarkToMarket');

            const pv = await loan.getCurrentPV(loanId);
            console.log("Performing second mark-to-market after 3 month");
            console.log("Present value of the loan for 30 FIL between Alice and Bob after first payment settlment: " + pv)
            console.log("");

            const ccyExp = await collateral.getCcyExposures(alice, bob, hexFILString);
            ccyExp.party0PV.toString().should.be.equal(pv.toString());
            ccyExp.party1PV.should.be.equal('0');
            ccyExp.netPayment.should.be.equal(pv.toString());
        });
    });

    describe("Test second loan by Alice and Bob for 1 BTC", async () => {
        const txHash = web3.utils.asciiToHex('0x_this_is_sample_tx_hash');
        let loanId = 2; // first loan in loan contract
        let btcAmount = web3.utils.toBN("1000000000000000000")

        it('Deposit 45 ETH by Alice in Collateral contract', async () => {
            let balance;
            let gasPrice;
            web3.eth.getGasPrice().then((res) => gasPrice = web3.utils.toBN(res));

            web3.eth.getBalance(alice).then((res) => balance = web3.utils.toBN(res));
            
            let depositAmt = web3.utils.toBN("45000000000000000000")
            let tx = await collateral.deposit({from: alice, value: depositAmt});
            if (tx.receipt.gasUsed != null) {
                balance = await (balance.sub(web3.utils.toBN(tx.receipt.gasUsed).mul(gasPrice)));
            }
            await emitted(tx, 'Deposit');

            aliceIndependentAmount = await aliceIndependentAmount.add(depositAmt);
            
            const book = await collateral.getCollateralBook(alice);
            book[0].should.be.equal('0');
            book[1].should.be.equal(aliceIndependentAmount.toString());
            book[2].should.be.equal(aliceLockedCollateral.toString());

            web3.eth.getBalance(alice).then((res) => {
                res.should.be.equal(balance.sub(depositAmt).toString());
            });
        });

        it('Successfully make order for 1 BTC by Bob, deposit 15 ETH by Bob, take this order by Alice', async () => {
            let depositAmt = web3.utils.toBN('15000000000000000000');

            let tx = await collateral.deposit({from: bob, value: depositAmt});
            await emitted(tx, 'Deposit');

            console.log("Making a new order to lend 1 BTC for 5 years by Bob");
            console.log("");

            let marketOrder = await btcLendingMarket.order(0, btcAmount, 305, {from: bob});
            await emitted(marketOrder, 'MakeOrder');

            console.log("Taking order for 1 BTC, and using collateral by Alice as a borrower");
            console.log("");

            marketOrder = await btcLendingMarket.order(1, btcAmount, 305, {from: alice});
            await emitted(marketOrder, 'TakeOrder');


            let btcUsed = (btcAmount.mul(web3.utils.toBN(15000))).div(web3.utils.toBN(10000));
            let btcInETH = await currencyController.convertToETH(hexBTCString, btcAmount, {from: alice});
            let aliceReqCollateral = await collateral.getBilateralPosition(alice, bob);
            aliceLockedCollateral = aliceReqCollateral.lockedCollateralB;
            aliceIndependentAmount = await aliceIndependentAmount.sub(web3.utils.toBN(aliceReqCollateral.lockedCollateralB));

            console.log("BTC in ETH is: " + btcInETH);
            console.log("");

            let rebalance = await collateral.getRebalanceCollateralAmounts(alice, bob);
            rebalance[1].toString().should.be.equal('0');
            rebalance[0].toString().should.be.equal('0');

            console.log("Calculating collateral coverage after registering loan deal for 30 FIL");
            console.log("");

            tx = await collateral.getCoverage(alice, bob);
            console.log("");
            console.log("Collateral coverage for Bob (lender) of 1 BTC is " + tx[1].toString());
            console.log("Collateral coverage for Alice (borrower) of 1 BTC is " + tx[0].toString());
        });

        it('Succesfully notify and confirm payment by Bob for 1 BTC and check the settled exposure in bilateral position', async () => {
            let notification = await loan.notifyPayment(loanId, btcAmount, txHash, {from: bob});
            await emitted(notification, 'NotifyPayment');

            console.log("Notifying borrower for succesful transfer of 1 BTC by Bob (lender)");
            console.log("");

            let pv = await loan.getCurrentPV(loanId);
            pv.toString().should.be.equal(btcAmount.toString());

            console.log("Present value of the loan for 1 BTC between Bob and Alice before first payment settlment: " + pv)
            console.log("");

            let confirmation = await loan.confirmPayment(loanId, btcAmount, txHash, {from: alice});
            await emitted(confirmation, 'ConfirmPayment');
            
            console.log("Confirming succesful transfer for 1 BTC by Alice (lender)");
            console.log("");

            const totalUnsettledExp = await collateral.getTotalUnsettledExp(alice);
            totalUnsettledExp.toString().should.be.equal("0");

            console.log("Calculating collateral coverage after settling the notional transfer of 1 BTC and mark-to-market");
            console.log("");

            tx = await loan.markToMarket(loanId, {from: alice});
            await emitted(tx, 'MarkToMarket');

            pv = await loan.getCurrentPV(loanId);
            console.log("");
            console.log("Present value of the loan for 1 BTC between Bob and Alice after notional payment settlement: " + pv);
            console.log("");

            tx = await collateral.getCoverage(alice, bob);

            console.log("");
            console.log("Collateral coverage for Bob (lender) of 1 BTC is " + tx[1].toString());
            console.log("Collateral coverage for Alice (borrower) of 1 BTC is " + tx[0].toString());

            pv = await loan.getCurrentPV(loanId);

            const ccyExp = await collateral.getCcyExposures(alice, bob, hexBTCString);
            ccyExp.party0PV.should.be.equal('0');
            ccyExp.party1PV.should.be.equal(pv.toString());
            ccyExp.netPayment.should.be.equal(pv.toString());
        });

        it("Shift time by 6 month, perform mark-to-market and present value updates", async () => {
            const dfs = await lendingController.getDiscountFactorsForCcy(hexBTCString);
            // console.log(dfs);

            let midBTCRates = await lendingController.getMidRatesForCcy(hexBTCString);
            console.log(midBTCRates[5].toString());

            let lendBTCRates = await lendingController.getLendRatesForCcy(hexBTCString);
            console.log(lendBTCRates[5].toString());

            let borrowBTCRates = await lendingController.getBorrowRatesForCcy(hexBTCString);
            console.log(borrowBTCRates[5].toString());

            console.log("");
            console.log("Shift time by 6 month, perform mark-to-market for BTC lending deal")

            await advanceTimeAndBlock(180 * ONE_DAY);
            let tx = await loan.markToMarket(loanId, {from: alice});
            await emitted(tx, 'MarkToMarket');

            const pv = await loan.getCurrentPV(loanId);
            console.log("");
            console.log("Present value of the loan for 1 BTC between Bob after 6 month: " + pv);

            tx = await collateral.getCoverage(alice, bob);

            console.log("");
            console.log("Collateral coverage for Bob (lender) of 1 BTC is " + tx[1].toString());
            console.log("Collateral coverage for Alice (borrower) of 1 BTC is " + tx[0].toString());

            const ccyExp = await collateral.getCcyExposures(alice, bob, hexBTCString);
            ccyExp.party0PV.toString().should.be.equal('0');
            ccyExp.party1PV.should.be.equal(pv.toString());
            ccyExp.netPayment.should.be.equal(pv.toString());

            let rebalance = await collateral.getRebalanceCollateralAmounts(alice, bob);
            rebalance[1].toString().should.be.equal('0');
            rebalance[0].toString().should.be.equal('0');
        });

    });

});